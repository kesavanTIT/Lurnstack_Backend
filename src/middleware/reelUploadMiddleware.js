const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure reels uploads directories exist under uploads/reels
const reelsUploadDir = path.join(__dirname, "../../uploads/reels");
if (!fs.existsSync(reelsUploadDir)) {
  fs.mkdirSync(reelsUploadDir, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, reelsUploadDir);
  },
  filename: (req, file, cb) => {
    const prefix = file.fieldname === 'video' ? 'reel-video' : 'reel-logo';
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, prefix + "-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter (videos for 'video', images for 'logo')
const fileFilter = (req, file, cb) => {
  if (file.fieldname === "video") {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only video files are allowed for the reel."), false);
    }
  } else if (file.fieldname === "logo") {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only image files are allowed for the logo."), false);
    }
  } else {
    cb(new Error("Unexpected file field."), false);
  }
};

const reelUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for video reels
  },
});

module.exports = reelUpload;
