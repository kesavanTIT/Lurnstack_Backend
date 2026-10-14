const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ── Ensure upload directories exist ─────────────────────────────────────────
const thumbnailDir = path.join(__dirname, "../../uploads/thumbnails");
const videoDir = path.join(__dirname, "../../uploads/videos");

[thumbnailDir, videoDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ── Unified Storage ─────────────────────────────────────────────────────────
// Routes using this middleware use .fields([...]) so multer checks fieldname
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "videoFile") {
      cb(null, videoDir);
    } else {
      cb(null, thumbnailDir); // thumbnail field
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// ── File Filter ──────────────────────────────────────────────────────────────
const fileFilter = (req, file, cb) => {
  const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  const videoTypes = [
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/avi",
    "video/mkv",
    "video/x-matroska",
    "video/quicktime",
    "video/x-msvideo",
  ];

  if (file.fieldname === "videoFile") {
    if (videoTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid video type. Allowed: MP4, WebM, OGG, AVI, MKV, MOV."), false);
    }
  } else if (file.fieldname === "thumbnail") {
    if (imageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid image type. Allowed: JPEG, PNG, WebP."), false);
    }
  } else {
    cb(null, true);
  }
};

// ── Multer Instance ──────────────────────────────────────────────────────────
const videoUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for videos
  },
});

module.exports = videoUpload;
