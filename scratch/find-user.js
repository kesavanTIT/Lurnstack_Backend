const prisma = require("../src/config/db");

async function main() {
  const users = await prisma.user.findMany({
    where: { fullName: { contains: "Nivetha", mode: "insensitive" } },
    select: { id: true, email: true, fullName: true, role: true }
  });
  console.log("Nivetha user:", users);
  
  if (users.length === 0) {
    const allTrainers = await prisma.user.findMany({
      select: { id: true, email: true, fullName: true, role: true }
    });
    console.log("All users in DB:", allTrainers.slice(0, 15));
  }
}

main().finally(() => prisma.$disconnect());
