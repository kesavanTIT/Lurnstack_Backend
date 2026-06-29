const prisma = require("./db");

const DEFAULT_CATEGORIES = [
  { name: "Web Development", slug: "web-development" },
  { name: "Frontend Development", slug: "frontend-development" },
  { name: "Backend Development", slug: "backend-development" },
  { name: "Full Stack Development", slug: "full-stack-development" },
  { name: "Programming", slug: "programming" },
  { name: "Mobile App Development", slug: "mobile-app-development" },
  { name: "UI/UX Design", slug: "ui-ux-design" },
  { name: "Cloud Computing", slug: "cloud-computing" },
  { name: "DevOps", slug: "devops" },
  { name: "Database", slug: "database" },
  { name: "Trainer Courses", slug: "trainer-courses" }
];

const seedDefaultCategories = async () => {
  try {
    console.log("🌱 Checking default categories...");
    for (const cat of DEFAULT_CATEGORIES) {
      const existing = await prisma.category.findUnique({
        where: { slug: cat.slug }
      });
      if (!existing) {
        await prisma.category.create({
          data: {
            name: cat.name,
            slug: cat.slug,
            description: `Default category for ${cat.name}`,
            status: "active"
          }
        });
        console.log(`✅ Seeded category: ${cat.name}`);
      }
    }
    console.log("🌱 Default categories check complete.");
  } catch (error) {
    console.error("⚠️ Error seeding default categories:", error.message);
  }
};

module.exports = seedDefaultCategories;
