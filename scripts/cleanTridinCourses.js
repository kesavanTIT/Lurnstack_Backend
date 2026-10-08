const prisma = require("../src/config/db");

async function main() {
  console.log("Cleaning up Tridin sessions...");

  // 1. Reset ALL sessions to isTridinOnly: false
  const resetResult = await prisma.liveSession.updateMany({
    data: {
      isTridinOnly: false,
    },
  });
  console.log(`Reset ${resetResult.count} sessions to isTridinOnly: false.`);

  // 2. Set isTridinOnly: true ONLY for sessions intended for Tridin candidates
  const keywords = ["react", "tridin", "daily", "practical", "training", "candidate"];
  
  const updateResult = await prisma.liveSession.updateMany({
    where: {
      OR: keywords.map(kw => ({ title: { contains: kw, mode: "insensitive" } })),
    },
    data: {
      isTridinOnly: true,
      publishState: "PUBLISHED",
    },
  });

  console.log(`Updated ${updateResult.count} sessions to isTridinOnly: true.`);

  // Verify resulting Tridin-only sessions
  const tridinSessions = await prisma.liveSession.findMany({
    where: { isTridinOnly: true },
    select: { id: true, title: true, isTridinOnly: true },
  });

  console.log("Tridin-only sessions count:", tridinSessions.length);
  console.log(tridinSessions);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
