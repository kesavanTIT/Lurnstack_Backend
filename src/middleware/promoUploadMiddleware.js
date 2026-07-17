const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure promo uploads directory exists under uploads/promos
const promoUploadDir = path.join(__dirname, "../../uploads/promos");
if (!fs.existsSync(promoUploadDir)) {
  fs.mkdirSync(promoUploadDir, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, promoUploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: promo-timestamp-random.extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "promo-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter (images only)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, and WebP are allowed."), false);
  }
};

const promoUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for banners/posters
  },
});

module.exports = promoUpload;
