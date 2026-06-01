console.log("Initializing LurnStack Backend...");
require("dotenv").config();
const express = require("express");
const cors = require("cors");

// ── Route Imports ────────────────────────────
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const adminCategoryRoutes = require("./routes/adminCategoryRoutes");
const studentRoutes = require("./routes/studentRoutes");
const trainerRoutes = require("./routes/trainerRoutes");
const sessionRoutes = require("./routes/sessionRoutes");
const offerCampaignRoutes = require("./routes/offerCampaignRoutes");

// ── App Setup ────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ───────────────────────────────
// Request Logger (Helpful for Railway debugging)
app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  next();
});

const allowedOrigins = [
  "https://admin.lurnstack.com",
  "http://localhost:3000",
  "http://localhost:3001"
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Handle preflight BEFORE all routes

// Webhook routes mounted with raw body parser BEFORE global json parser
const webhookRoutes = require("./routes/webhookRoutes");
app.use("/api/webhooks", express.raw({ type: "application/json" }), webhookRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads", {
  setHeaders: (res) => {
    res.set("Access-Control-Allow-Origin", "*");
  }
}));


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
app.use("/api/admin/categories", adminCategoryRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/trainer", trainerRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api", offerCampaignRoutes);

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
const startServer = async () => {
  try {
    const prisma = require("./config/db");

    // Initialize scheduled jobs
    require("./jobs/occurrenceJob"); // Nightly occurrence generator
    require("./jobs/attendanceJob");
    require("./jobs/reminderJob");   // 10-min session reminder via ZeptoMail (email) + Fast2SMS (SMS)
    const { startSessionReminderWhatsappJob } = require("./jobs/sessionReminderWhatsappJob");
    startSessionReminderWhatsappJob();

    
    // Self-healing: Ensure 'updatedAt' column exists if migration skipped it
    console.log("🛠️ Checking database schema consistency...");
    const isMySQL = process.env.DATABASE_URL && process.env.DATABASE_URL.includes("mysql");
    if (isMySQL) {
      await prisma.$executeRaw`
        ALTER TABLE LiveClass ADD COLUMN IF NOT EXISTS updatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
      `.catch(err => console.error("⚠️ DB Patch Warning (MySQL):", err.message));
    } else {
      await prisma.$executeRaw`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='LiveClass' AND column_name='updatedAt') THEN
            ALTER TABLE "LiveClass" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
          END IF;
        END $$;
      `.catch(err => console.error("⚠️ DB Patch Warning (Postgres):", err.message));
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🚀 Health check: http://localhost:${PORT}/`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

module.exports = app;
