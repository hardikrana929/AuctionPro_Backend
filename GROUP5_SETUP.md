# AuctionPro Group 5 — Teams and Players

## Environment
Copy `.env.example` values into your local `.env` and set real credentials. Never commit `.env`.

Required Cloudinary variables:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## API routes (admin-only; Bearer token required)
### Teams
- `GET /api/admin/teams` — list teams; optional `?auctionId=AUC-...`
- `GET /api/admin/teams/:teamId` — team detail
- `POST /api/admin/teams` — multipart form fields `name`, `shortName`, `auctionId`, optional file `logo`
- `PUT /api/admin/teams/:teamId` — multipart fields `name`, `shortName`, optional file `logo`
- `DELETE /api/admin/teams/:teamId` — blocked if players are linked

### Players
- `GET /api/admin/players` — list players; optional `auctionId`, `role`, `status`, `search` query parameters
- `GET /api/admin/players/:playerId` — player detail
- `POST /api/admin/players` — multipart fields `name`, `role`, `nationality`, `age`, `basePrice`, `auctionId`, optional `teamId`, optional file `image`
- `PUT /api/admin/players/:playerId` — update player fields and optional `image`
- `DELETE /api/admin/players/:playerId` — sold players cannot be deleted

Images are restricted to JPEG, PNG, or WebP and 5 MB maximum. Server-side signature checks are also performed. Cloudinary stores images; MongoDB stores the secure URL and a private Cloudinary public ID for cleanup.

## Run
From the backend folder:
```bash
npm install
npm run dev
```

From the frontend folder:
```bash
npm install
npm run dev
```

Set frontend `.env` to `VITE_API_URL=http://localhost:5000/api`.

## User login and dashboard (added)
- `POST /api/auth/user/login` accepts `username`, `password`, and `auctionId`.
- `GET /api/user/dashboard` returns the currently assigned auction, its teams, player pool and summary counts for the authenticated user. The route is read-only and derives the auction from the signed token; it does not trust a client-supplied auction ID.
- Public frontend landing page: `/`
- User login: `/login` (alias `/user/login` redirects there)
- User dashboard: `/dashboard`
- Admin login remains `/admin/login`.
