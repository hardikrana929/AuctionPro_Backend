const multer = require("multer");

const errorMiddleware = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let statusCode = err.statusCode || 500;
  let message = err.message || "Request failed";

  if (err instanceof multer.MulterError) {
    statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Image must be 5 MB or smaller."
        : "Invalid image upload.";
  } else if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((item) => item.message)
      .join(". ");
  } else if (err.code === 11000) {
    statusCode = 409;
    message = "A record with these details already exists.";
  }

  if (statusCode >= 500) console.error(err);

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? "Internal server error" : message,
  });
};

module.exports = errorMiddleware;
