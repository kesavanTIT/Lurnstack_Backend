const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  console.log("=== Querying all LiveClass records ===");
  const classes = await prisma.liveClass.findMany();

  console.log(`Total classes: ${classes.length}`);
  for (const c of classes) {
    console.log(`\nID: ${c.id}`);
    console.log(`Course Name: ${c.courseName}`);
    console.log(`Class Title: ${c.classTitle}`);
    console.log(`Instructor: ${c.instructor}`);
    console.log(`Date: ${c.date}`);
    console.log(`Time: ${c.time}`);
    console.log(`Section Type: ${c.sectionType}`);
    console.log(`Is Recurring: ${c.isRecurring}`);
    console.log(`Scheduled At: ${c.scheduledAt ? c.scheduledAt.toISOString() : "null"}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
