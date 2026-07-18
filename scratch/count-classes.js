const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const classes = await prisma.liveClass.findMany();
  console.log(`=== LIVECLASS RECORDS (${classes.length}) ===`);
  classes.forEach((c) => {
    console.log(`ID: ${c.id}, CourseName: ${c.courseName}, ClassTitle: ${c.classTitle}, Instructor: ${c.instructor}`);
  });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
