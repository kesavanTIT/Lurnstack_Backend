const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const posters = await prisma.promoPoster.findMany({ take: 3 });
  console.log("Posters in DB:", JSON.stringify(posters, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
