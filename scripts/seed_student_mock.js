const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function seedStudent() {
  console.log("🌱 Starting Student Mock Data Seeding...");

  try {
    const studentEmail = "student_mock@lurnstack.com";
    let student = await prisma.user.findUnique({ where: { email: studentEmail } });
    if (!student) {
      const password = await bcrypt.hash("password123", 10);
      student = await prisma.user.create({
        data: {
          fullName: "Mock Student",
          email: studentEmail,
          password,
          role: "STUDENT",
        },
      });
      console.log(`✅ Created Test Student: ${student.email}`);
    } else {
      console.log(`✅ Student already exists: ${student.email}`);
    }

    console.log("\n🎉 Seeding Complete!");
    console.log("\n--- TEST CREDENTIALS ---");
    console.log(`Student Email: ${studentEmail}`);
    console.log(`Password: password123`);
    console.log("--------------------------\n");

  } catch (error) {
    console.error("❌ Error seeding student mock data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedStudent();
