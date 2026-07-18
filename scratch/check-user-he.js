const prisma = require("../src/config/db");

async function main() {
  const users = await prisma.user.findMany({
    where: {
      fullName: {
        startsWith: "He",
        mode: "insensitive"
      }
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
    }
  });

  console.log("Users starting with 'He':");
  users.forEach((u) => {
    console.log(`- ID=${u.id}, Name="${u.fullName}", Email="${u.email}", Role=${u.role}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
