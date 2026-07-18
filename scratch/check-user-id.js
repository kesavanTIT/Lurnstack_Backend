const prisma = require("../src/config/db");

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: "kesavan.tit@gmail.com", mode: "insensitive" } }
  });
  if (user) {
    console.log(`User found: ID=${user.id}, Name=${user.fullName}, Email=${user.email}, Role=${user.role}`);
  } else {
    console.log("User not found!");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
