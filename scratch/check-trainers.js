const prisma = require("../src/config/db");

async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: ["TRAINER", "ADMIN"] } },
    select: { id: true, email: true, fullName: true, role: true, isActive: true }
  });
  console.log("Trainers/Admins in local DB:", users);
  await prisma.$disconnect();
}
main().catch(console.error);
