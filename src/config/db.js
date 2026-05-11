const { PrismaClient } = require("@prisma/client");

// Singleton pattern: reuse the same PrismaClient instance across the app
const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
});

prisma.$connect()
  .then(() => console.log("✅ Database connection established"))
  .catch((err) => console.error("❌ Database connection failed:", err));

module.exports = prisma;
