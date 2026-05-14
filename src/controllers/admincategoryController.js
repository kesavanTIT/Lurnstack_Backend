const prisma = require("../config/db");

// ─────────────────────────────────────────────
// @desc    Create a new category
// @route   POST /api/admin/categories
// @access  Private/Admin
// ─────────────────────────────────────────────
const createCategory = async (req, res) => {
  try {
    const { name, slug, description } = req.body;

    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: "Please provide both 'name' and 'slug' fields.",
      });
    }

    // Check for duplicate slug
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A category with slug '${slug}' already exists.`,
      });
    }

    const category = await prisma.category.create({
      data: { name, slug, description: description || null },
    });

    return res.status(201).json({
      success: true,
      message: "Created",
      data: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
      },
    });
  } catch (error) {
    console.error("Create Category Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to create category.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Get all categories
// @route   GET /api/admin/categories
// @access  Private/Admin
// ─────────────────────────────────────────────
const getAllCategories = async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Categories fetched successfully.",
      data: categories,
    });
  } catch (error) {
    console.error("Get All Categories Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to fetch categories.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Update a category
// @route   PATCH /api/admin/categories/:categoryId
// @access  Private/Admin
// ─────────────────────────────────────────────
const updateCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name, description } = req.body;

    // At least one field must be provided
    if (!name && description === undefined) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update: 'name' or 'description'.",
      });
    }

    const existing = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    const updated = await prisma.category.update({
      where: { id: categoryId },
      data: {
        name: name || existing.name,
        description: description !== undefined ? description : existing.description,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Updated",
      data: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
      },
    });
  } catch (error) {
    console.error("Update Category Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to update category.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────
// @desc    Delete a category
// @route   DELETE /api/admin/categories/:categoryId
// @access  Private/Admin
// ─────────────────────────────────────────────
const deleteCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const existing = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    await prisma.category.delete({ where: { id: categoryId } });

    return res.status(200).json({
      success: true,
      message: "Deleted",
      data: null,
    });
  } catch (error) {
    console.error("Delete Category Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Failed to delete category.",
      error: error.message,
    });
  }
};

module.exports = {
  createCategory,
  getAllCategories,
  updateCategory,
  deleteCategory,
};
