const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.liveSession.findMany({
    where: {
      status: "active",
      deleteRequested: false,
    },
    include: {
      trainer: { select: { fullName: true, email: true } },
    },
  });

  console.log(`Found ${sessions.length} active sessions:`);
  sessions.forEach((s) => {
    console.log(`- ID: ${s.id}, Title: ${s.title}, Trainer: ${s.trainer?.fullName} (${s.trainer?.email}), CreatedAt: ${s.createdAt}`);
  });
}

main()
  .catch((e) => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
