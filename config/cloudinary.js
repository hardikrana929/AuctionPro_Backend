
const cloudinary = require("cloudinary").v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

function validateCloudinaryConfig() {
    const required = [
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
    ];

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length) {
        throw new Error(
            `Missing Cloudinary environment variables: ${missing.join(", ")}`,
        );
    }
}

function uploadImage(buffer, folder) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: `auctionpro/${folder}`,
                resource_type: "image",
                allowed_formats: ["jpg", "jpeg", "png", "webp"],
                transformation: [
                    { width: 1200, height: 1200, crop: "limit" },
                    { quality: "auto" },
                    { fetch_format: "auto" },
                ],
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            },
        );

        stream.end(buffer);
    });
}

async function deleteImage(publicId) {
    if (!publicId) return;

    return cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
        invalidate: true,
    });
}

module.exports = {
    cloudinary,
    validateCloudinaryConfig,
    uploadImage,
    deleteImage,
};
