const prisma = require("../src/config/db");

async function diagnose() {
  console.log("=== DB - All live sessions with targetAudience ===");
  const all = await prisma.liveSession.findMany({
    select: {
      id: true,
      title: true,
      targetAudience: true,
      isTridinOnly: true,
      meetingLink: true,
      status: true,
      deleteRequested: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  all.forEach(s => {
    const link = s.meetingLink || "NO LINK";
    const hasLink = link && link !== "null" && link !== "undefined" && link.trim() !== "";
    console.log(`[${s.targetAudience}] ${s.title} | isTridinOnly=${s.isTridinOnly} | link=${hasLink ? "YES" : "NONE"} | status=${s.status} | deleted=${s.deleteRequested}`);
  });

  console.log("\n=== DB - Sessions matching Tridin query ===");
  const tridin = await prisma.liveSession.findMany({
    where: {
      status: { not: "deleted" },
      deleteRequested: false,
      OR: [
        { isTridinOnly: true },
        { targetAudience: "TRIDIN" },
        { targetAudience: "BOTH" },
      ],
      meetingLink: { not: null },
      NOT: [
        { meetingLink: "" },
        { meetingLink: "null" },
        { meetingLink: "undefined" },
      ],
    },
    select: { id: true, title: true, targetAudience: true, isTridinOnly: true, meetingLink: true },
  });

  console.log(`\nTridin query finds ${tridin.length} sessions.`);
  tridin.forEach(s => {
    console.log(`  - ${s.title}: targetAudience=${s.targetAudience}, isTridinOnly=${s.isTridinOnly}`);
  });
}

diagnose().catch(console.error).finally(() => prisma.$disconnect());
