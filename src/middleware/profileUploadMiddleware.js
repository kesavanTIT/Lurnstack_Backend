const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "../../uploads/profiles");

// Ensure profiles upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ensure directory exists again just in case
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const userId = req.user ? req.user.id : "anonymous";
    const ext = path.extname(file.originalname).toLowerCase();
    const timestamp = Date.now();
    // Recommended filename: user-{userId}-{timestamp}.jpg/webp/png
    cb(null, `user-${userId}-${timestamp}${ext}`);
  },
});

// File validation filter
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];

  const ext = path.extname(file.originalname).toLowerCase();
  const isMimeValid = allowedMimeTypes.includes(file.mimetype);
  const isExtValid = allowedExtensions.includes(ext);

  if (!isMimeValid || !isExtValid) {
    return cb(new Error("Invalid file type. Only JPEG, JPG, PNG, and WebP images are allowed."), false);
  }
  
  // Guard against executable files or double extensions (e.g. hack.exe.png, though path.extname gets the last one, we do extra checks)
  if (file.originalname.toLowerCase().includes(".exe") || file.originalname.toLowerCase().includes(".sh") || file.originalname.toLowerCase().includes(".bat")) {
    return cb(new Error("Executable or script files are strictly prohibited."), false);
  }

  cb(null, true);
};

const uploadProfilePhoto = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Wrapper to catch errors and return 400 Bad Request
const profilePhotoUploadMiddleware = (req, res, next) => {
  uploadProfilePhoto.single("photo")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File size exceeds the 5MB limit.",
        });
      }
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    
    // File validation: check if file was provided
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No photo file provided.",
      });
    }
    
    next();
  });
};

module.exports = profilePhotoUploadMiddleware;
