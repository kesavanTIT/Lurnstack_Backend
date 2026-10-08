const jwt = require("jsonwebtoken");

// ─────────────────────────────────────────────
// @desc    Verify JWT token from Authorization header
// @usage   Apply to any protected route
// ─────────────────────────────────────────────
const protect = (req, res, next) => {
  try {
    let token = null;

    // Check Bearer token header FIRST
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }

    // Fallback to admin_token cookie if no Bearer token provided
    if (!token && req.headers.cookie) {
      const cookies = {};
      req.headers.cookie.split(";").forEach((cookie) => {
        const parts = cookie.split("=");
        if (parts.length >= 2) {
          cookies[parts.shift().trim()] = decodeURIComponent(parts.join("="));
        }
      });
      req.cookies = cookies;
      if (cookies.admin_token) {
        token = cookies.admin_token;
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    // Verify and decode the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach decoded payload (id, role) to request object
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token. Please log in again.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Restrict access to admin role only
// @usage   Apply AFTER protect middleware
// ─────────────────────────────────────────────
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === "ADMIN") {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admins only.",
    });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "ADMIN") {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin privileges required.",
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Restrict access to Tridin candidates only
// @usage   Apply AFTER protect middleware
// ─────────────────────────────────────────────
const tridinOnly = async (req, res, next) => {
  try {
    const role = String(req.user?.role || "").toUpperCase();
    if (role === "TRIDIN_CANDIDATE" || role === "TRIDIN" || role === "ADMIN") {
      return next();
    }
    if (req.user?.id) {
      const prisma = require("../config/db");
      const dbUser = await prisma.user.findUnique({
        where: { id: Number(req.user.id) },
        select: { role: true, email: true },
      });
      const dbRole = String(dbUser?.role || "").toUpperCase();
      const dbEmail = String(dbUser?.email || "").toLowerCase();
      if (
        dbRole === "TRIDIN_CANDIDATE" ||
        dbRole === "TRIDIN" ||
        dbEmail.endsWith("@tridinsoftware.com") ||
        dbRole === "ADMIN"
      ) {
        req.user.role = "tridin";
        return next();
      }
    }
    return res.status(403).json({
      success: false,
      message: "Access denied. Tridin Software candidates only.",
    });
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Tridin Software candidates only.",
    });
  }
};

module.exports = { protect, adminOnly, isAdmin, tridinOnly };
