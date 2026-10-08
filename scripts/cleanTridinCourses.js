const prisma = require("../src/config/db");

async function main() {
  console.log("Cleaning up Tridin candidate sessions...");

  // 1. Reset EVERY single session in the database to isTridinOnly: false
  const resetResult = await prisma.liveSession.updateMany({
    data: {
      isTridinOnly: false,
    },
  });
  console.log(`Reset all ${resetResult.count} sessions to isTridinOnly: false.`);

  // 2. Search strictly for sessions with 'react' or 'tridin' in title or description
  const targetSessions = await prisma.liveSession.findMany({
    where: {
      OR: [
        { title: { contains: "react", mode: "insensitive" } },
        { title: { contains: "tridin", mode: "insensitive" } },
        { description: { contains: "tridin", mode: "insensitive" } },
      ],
    },
  });

  if (targetSessions.length > 0) {
    const ids = targetSessions.map((s) => s.id);
    await prisma.liveSession.updateMany({
      where: { id: { in: ids } },
      data: { isTridinOnly: true, publishState: "PUBLISHED" },
    });
    console.log(`Set isTridinOnly: true for ${targetSessions.length} matching sessions:`);
    console.table(targetSessions.map((s) => ({ id: s.id, title: s.title })));
  } else {
    // Fallback: If no session matched 'react' or 'tridin', set ONLY the single most recently created session
    const newest = await prisma.liveSession.findFirst({
      orderBy: { createdAt: "desc" },
    });
    if (newest) {
      await prisma.liveSession.update({
        where: { id: newest.id },
        data: { isTridinOnly: true, publishState: "PUBLISHED" },
      });
      console.log(`Fallback: Set ONLY 1 newest session (${newest.title}) to isTridinOnly: true.`);
    }
  }

  // 3. Final verification print
  const tridinOnlyCount = await prisma.liveSession.count({
    where: { isTridinOnly: true },
  });
  console.log(`FINAL RESULT: Exactly ${tridinOnlyCount} session(s) marked as Tridin-Only.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
