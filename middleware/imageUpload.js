const multer = require("multer");

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      const error = new Error("Only JPEG, PNG, and WebP images are allowed.");
      error.statusCode = 400;
      return callback(error);
    }

    callback(null, true);
  },
});

module.exports = imageUpload;
