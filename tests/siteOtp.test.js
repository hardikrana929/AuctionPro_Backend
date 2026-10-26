/**
 * End-to-end tests for the site-wide email OTP gate.
 * Runs the REAL Express app + REAL nodemailer against a local in-process SMTP
 * server, so the e-mail is genuinely sent, received and parsed.
 *
 * Run:  npm test
 */
const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { SMTPServer } = require("smtp-server");
const { simpleParser } = require("mailparser");

const ROOT = path.resolve(__dirname, "..");
const OTP_EMAIL = "Hstudy.Project@Gmail.com"; // mixed case on purpose (regression test)

let smtp, smtpPort;
let inbox = [];
const realNow = Date.now;
let offsetMs = 0;
const advance = (ms) => { offsetMs += ms; };

before(async () => {
  smtp = new SMTPServer({
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ["STARTTLS"],
    onAuth(auth, _s, cb) {
      if (auth.username === "sender@test.local" && auth.password === "app-password") return cb(null, { user: 1 });
      return cb(new Error("Invalid login"));
    },
    async onData(stream, _s, cb) {
      try { inbox.push(await simpleParser(stream)); cb(); } catch (e) { cb(e); }
    },
  });
  await new Promise((r) => smtp.listen(0, "127.0.0.1", r));
  smtpPort = smtp.server.address().port;
  Date.now = () => realNow() + offsetMs;
});

after(async () => {
  Date.now = realNow;
  await new Promise((r) => smtp.close(r));
});

function setEnv(overrides = {}) {
  Object.assign(process.env, {
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-test-secret-test-secret",
    SITE_OTP_EMAIL: OTP_EMAIL,
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(smtpPort),
    SMTP_SECURE: "false",
    SMTP_USER: "sender@test.local",
    SMTP_PASS: "app-password",
    SMTP_FROM: "AuctionPro Security <sender@test.local>",
    ...overrides,
  });
  for (const k of Object.keys(overrides)) if (overrides[k] === undefined) delete process.env[k];
}

async function freshServer() {
  const mongoose = require("mongoose");
  for (const name of mongoose.modelNames()) mongoose.deleteModel(name);
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(ROOT) && !key.includes("node_modules") && !key.includes(`${path.sep}tests${path.sep}`)) delete require.cache[key];
  }
  const app = require(path.join(ROOT, "app"));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, { method, headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

const otpFrom = (mail) => (mail.text.match(/\b(\d{6})\b/) || [])[1];
const wrongOtp = (real) => (real === "000000" ? "111111" : "000000");

describe("site OTP", () => {
  let s;
  beforeEach(async () => {
    inbox = []; offsetMs = 0; setEnv();
    if (s) await s.close();
    s = await freshServer();
  });
  after(async () => { if (s) await s.close(); });

  test("1. OTP e-mail is actually delivered with a valid 6-digit code", async () => {
    const r = await s.call("POST", "/api/site-otp/send", {});
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(inbox.length, 1);
    const mail = inbox[0];
    assert.equal(mail.to.value[0].address.toLowerCase(), OTP_EMAIL.toLowerCase());
    assert.match(mail.subject, /AuctionPro verification code/);
    assert.match(otpFrom(mail), /^\d{6}$/);
    assert.match(mail.html, new RegExp(otpFrom(mail)));
  });

  test("2. correct OTP verifies and returns a site token", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    const r = await s.call("POST", "/api/site-otp/verify", { otp: otpFrom(inbox[0]) });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.token);
  });

  test("3. site token unlocks protected APIs; no/garbage token is blocked", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    const { body } = await s.call("POST", "/api/site-otp/verify", { otp: otpFrom(inbox[0]) });
    const blocked = await s.call("GET", "/api/notifications");
    assert.equal(blocked.status, 403);
    const garbage = await s.call("GET", "/api/notifications", null, { "X-Site-Verification": "abc.def.ghi" });
    assert.equal(garbage.status, 403);
    const allowed = await s.call("GET", "/api/notifications", null, { "X-Site-Verification": body.token });
    assert.notEqual(allowed.status, 403, "valid token must pass the site gate (auth layer may then answer 401)");
  });

  test("4. wrong OTP is rejected with remaining attempts", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    const r = await s.call("POST", "/api/site-otp/verify", { otp: wrongOtp(otpFrom(inbox[0])) });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /Incorrect OTP\. 4 attempts remaining/);
  });

  test("5. malformed OTP (letters / short / empty) is rejected", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    for (const otp of ["abc123", "12345", "1234567", "", undefined]) {
      const r = await s.call("POST", "/api/site-otp/verify", { otp });
      assert.equal(r.status, 400, `otp=${otp}`);
    }
  });

  test("6. verify without ever sending an OTP is rejected", async () => {
    const r = await s.call("POST", "/api/site-otp/verify", { otp: "123456" });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /expired|request/i);
  });

  test("7. OTP is single-use", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    const otp = otpFrom(inbox[0]);
    assert.equal((await s.call("POST", "/api/site-otp/verify", { otp })).status, 200);
    assert.equal((await s.call("POST", "/api/site-otp/verify", { otp })).status, 400);
  });

  test("8. OTP expires after 5 minutes (even the correct code)", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    const otp = otpFrom(inbox[0]);
    advance(5 * 60 * 1000 + 1000);
    const r = await s.call("POST", "/api/site-otp/verify", { otp });
    assert.equal(r.status, 400);
    assert.match(r.body.message, /expired/i);
  });

  test("9. OTP is still valid just before the 5-minute mark", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    advance(4 * 60 * 1000 + 50 * 1000);
    assert.equal((await s.call("POST", "/api/site-otp/verify", { otp: otpFrom(inbox[0]) })).status, 200);
  });

  test("10. resend within 60s is blocked with a retry hint and sends no 2nd mail", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    advance(20 * 1000);
    const r = await s.call("POST", "/api/site-otp/send", {});
    assert.equal(r.status, 429);
    assert.ok(r.body.retryAfterSeconds > 0 && r.body.retryAfterSeconds <= 60, JSON.stringify(r.body));
    await new Promise((x) => setTimeout(x, 200));
    assert.equal(inbox.length, 1);
  });

  test("11. after an OTP expires, a second OTP is sent, received and works; old one is dead", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    const first = otpFrom(inbox[0]);
    advance(5 * 60 * 1000 + 1000);
    assert.equal((await s.call("POST", "/api/site-otp/verify", { otp: first })).status, 400);
    const resend = await s.call("POST", "/api/site-otp/send", {});
    assert.equal(resend.status, 200, JSON.stringify(resend.body));
    assert.equal(inbox.length, 2);
    const second = otpFrom(inbox[1]);
    if (second !== first) assert.equal((await s.call("POST", "/api/site-otp/verify", { otp: first })).status, 400);
    assert.equal((await s.call("POST", "/api/site-otp/verify", { otp: second })).status, 200);
  });

  test("12. resend after the 60s cooldown invalidates the previous (unexpired) OTP", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    const first = otpFrom(inbox[0]);
    advance(61 * 1000);
    assert.equal((await s.call("POST", "/api/site-otp/send", {})).status, 200);
    const second = otpFrom(inbox[1]);
    if (second !== first) assert.equal((await s.call("POST", "/api/site-otp/verify", { otp: first })).status, 400);
    assert.equal((await s.call("POST", "/api/site-otp/verify", { otp: second })).status, 200);
  });

  test("13. 5 wrong attempts lock the OTP; the correct code no longer works until a new one is sent", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    const otp = otpFrom(inbox[0]);
    for (let i = 0; i < 4; i++) assert.equal((await s.call("POST", "/api/site-otp/verify", { otp: wrongOtp(otp) })).status, 400);
    assert.equal((await s.call("POST", "/api/site-otp/verify", { otp: wrongOtp(otp) })).status, 429); // 5th wrong guess locks it
    const locked = await s.call("POST", "/api/site-otp/verify", { otp });
    assert.equal(locked.status, 429);
    advance(61 * 1000);
    await s.call("POST", "/api/site-otp/send", {});
    assert.equal((await s.call("POST", "/api/site-otp/verify", { otp: otpFrom(inbox[1]) })).status, 200);
  });

  test("14. site token expires after 30 minutes", async () => {
    await s.call("POST", "/api/site-otp/send", {});
    const { body } = await s.call("POST", "/api/site-otp/verify", { otp: otpFrom(inbox[0]) });
    advance(31 * 60 * 1000);
    const r = await s.call("GET", "/api/notifications", null, { "X-Site-Verification": body.token });
    assert.equal(r.status, 403);
  });

  test("15. SMTP failure returns a clear 503 and does NOT lock out an immediate retry", async () => {
    setEnv({ SMTP_PORT: "1" }); // nothing listens here
    await s.close(); s = await freshServer();
    const fail = await s.call("POST", "/api/site-otp/send", {});
    assert.equal(fail.status, 503, JSON.stringify(fail.body));
    assert.match(fail.body.message, /could not send/i);
    setEnv({ SMTP_PORT: String(smtpPort) });
    const retry = await s.call("POST", "/api/site-otp/send", {});
    assert.equal(retry.status, 200, "retry right after a failed send must not hit the 60s cooldown: " + JSON.stringify(retry.body));
  });

  test("16. wrong SMTP password is reported as 503, not a crash", async () => {
    setEnv({ SMTP_PASS: "bad-password" });
    await s.close(); s = await freshServer();
    const r = await s.call("POST", "/api/site-otp/send", {});
    assert.equal(r.status, 503);
  });

  test("17. missing SMTP config gives a readable 503", async () => {
    setEnv({ SMTP_HOST: undefined });
    await s.close(); s = await freshServer();
    const r = await s.call("POST", "/api/site-otp/send", {});
    assert.equal(r.status, 503);
    assert.match(r.body.message, /not configured|could not send/i);
  });

  test("18. two simultaneous send requests (React StrictMode) send exactly one e-mail", async () => {
    const [a, b] = await Promise.all([s.call("POST", "/api/site-otp/send", {}), s.call("POST", "/api/site-otp/send", {})]);
    assert.deepEqual([a.status, b.status].sort(), [200, 429]);
    await new Promise((x) => setTimeout(x, 200));
    assert.equal(inbox.length, 1);
  });

  test("21. Resend (HTTPS) is used when RESEND_API_KEY is set - no SMTP involved", async () => {
    const calls = [];
    const mock = http.createServer((req, res) => {
      let body = ""; req.on("data", (c) => (body += c));
      req.on("end", () => { calls.push({ auth: req.headers.authorization, body: JSON.parse(body) }); res.setHeader("Content-Type", "application/json"); res.end('{"id":"abc"}'); });
    });
    await new Promise((r) => mock.listen(0, "127.0.0.1", r));
    setEnv({ RESEND_API_KEY: "re_test_key", RESEND_API_URL: `http://127.0.0.1:${mock.address().port}/emails`, SMTP_PORT: "1" });
    await s.close(); s = await freshServer();
    const r = await s.call("POST", "/api/site-otp/send", {});
    await new Promise((x) => mock.close(x));
    delete process.env.RESEND_API_KEY; delete process.env.RESEND_API_URL;
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].auth, "Bearer re_test_key");
    assert.deepEqual(calls[0].body.to, [OTP_EMAIL.toLowerCase()]);
    assert.match(calls[0].body.text, /\b\d{6}\b/);
    assert.equal(inbox.length, 0, "SMTP must not be used");
  });

  test("22. Resend API rejection gives 503 with a readable reason code and allows retry", async () => {
    const mock = http.createServer((req, res) => { req.resume(); req.on("end", () => { res.statusCode = 403; res.end('{"message":"domain not verified"}'); }); });
    await new Promise((r) => mock.listen(0, "127.0.0.1", r));
    setEnv({ RESEND_API_KEY: "re_bad", RESEND_API_URL: `http://127.0.0.1:${mock.address().port}/emails` });
    await s.close(); s = await freshServer();
    const r = await s.call("POST", "/api/site-otp/send", {});
    await new Promise((x) => mock.close(x));
    delete process.env.RESEND_API_KEY; delete process.env.RESEND_API_URL;
    assert.equal(r.status, 503);
    assert.equal(r.body.reason, "RESEND_403");
    assert.equal((await s.call("POST", "/api/site-otp/send", {})).status, 200); // falls back to SMTP, no cooldown lock
  });

  test("23. SMTP failure exposes a reason code for debugging", async () => {
    setEnv({ SMTP_PORT: "1" });
    await s.close(); s = await freshServer();
    const r = await s.call("POST", "/api/site-otp/send", {});
    assert.equal(r.status, 503);
    assert.ok(r.body.reason, JSON.stringify(r.body));
  });

  test("19. health + OTP routes are reachable without a site token", async () => {
    assert.notEqual((await s.call("GET", "/api/health")).status, 403);
  });

  test("20. OTP send is rate limited per IP", async () => {
    let last;
    for (let i = 0; i < 12; i++) last = await s.call("POST", "/api/site-otp/send", {});
    assert.equal(last.status, 429);
    assert.match(last.body.message, /too many|wait/i);
  });
});
