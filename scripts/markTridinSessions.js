const prisma = require("../src/config/db");

async function main() {
  console.log("Resetting all non-Tridin sessions to isTridinOnly: false...");

  // 1. Reset all sessions to isTridinOnly: false
  const resetResult = await prisma.liveSession.updateMany({
    data: {
      isTridinOnly: false,
    },
  });
  console.log("Reset count:", resetResult.count);

  // 2. Find sessions that were uploaded specifically for Tridin (e.g. title contains "react", "tridin", "daily", or recent candidate sessions)
  const tridinSessions = await prisma.liveSession.findMany({
    where: {
      OR: [
        { title: { contains: "react", mode: "insensitive" } },
        { title: { contains: "tridin", mode: "insensitive" } },
        { description: { contains: "tridin", mode: "insensitive" } },
      ],
    },
  });

  console.log("Found Tridin target sessions:", tridinSessions.map(s => ({ id: s.id, title: s.title })));

  if (tridinSessions.length > 0) {
    const ids = tridinSessions.map(s => s.id);
    const setTridinResult = await prisma.liveSession.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        isTridinOnly: true,
        publishState: "PUBLISHED",
      },
    });
    console.log("Set isTridinOnly: true for:", setTridinResult.count, "sessions.");
  } else {
    // If no session matched keyword, set the latest session to isTridinOnly: true
    const latest = await prisma.liveSession.findFirst({ orderBy: { createdAt: "desc" } });
    if (latest) {
      await prisma.liveSession.update({
        where: { id: latest.id },
        data: { isTridinOnly: true, publishState: "PUBLISHED" },
      });
      console.log(`Set latest session (${latest.title}) to isTridinOnly: true`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
