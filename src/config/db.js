const { PrismaClient } = require("@prisma/client");

// Singleton pattern: reuse the same PrismaClient instance across the app
const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
});

module.exports = prisma;
