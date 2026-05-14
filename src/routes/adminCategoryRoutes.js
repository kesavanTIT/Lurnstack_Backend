const express = require("express");
const router = express.Router();
const {
  createCategory,
  getAllCategories,
  updateCategory,
  deleteCategory,
} = require("../controllers/admincategoryController");
const { protect, isAdmin } = require("../middleware/authMiddleware");

// ── Protect all category routes ───────────────
router.use(protect);
router.use(isAdmin);

// ── Category CRUD Endpoints ───────────────────
// POST   /api/admin/categories          → Create a category
router.post("/", createCategory);

// GET    /api/admin/categories          → List all categories
router.get("/", getAllCategories);

// PATCH  /api/admin/categories/:categoryId → Update a category
router.patch("/:categoryId", updateCategory);

// DELETE /api/admin/categories/:categoryId → Delete a category
router.delete("/:categoryId", deleteCategory);

module.exports = router;
