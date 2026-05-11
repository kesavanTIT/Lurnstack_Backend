require("dotenv").config();
const express = require("express");
const cors = require("cors");

// ── Route Imports ────────────────────────────
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");

// ── App Setup ────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ───────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health Check ─────────────────────────────
app.get("/", async (req, res) => {
  try {
    const prisma = require("./config/db");
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      success: true,
      message: "🚀 LurnStack Backend API is running!",
      database: "Connected ✅",
      version: "1.0.0",
    });
  } catch (error) {
    res.json({
      success: true,
      message: "🚀 LurnStack Backend API is running!",
      database: "Disconnected ❌",
      error: error.message,
      version: "1.0.0",
    });
  }
});

// ── API Routes ───────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

// ── 404 Handler ──────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found.`,
  });
});

// ── Global Error Handler ─────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(500).json({
    success: false,
    message: "Something went wrong on the server.",
  });
});

// ── Start Server ─────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

module.exports = app;
