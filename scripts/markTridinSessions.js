const prisma = require("../src/config/db");

async function main() {
  // Find all active live sessions or sessions with "react" in title or all sessions
  const sessions = await prisma.liveSession.findMany();
  console.log("Total sessions found:", sessions.length);

  for (const s of sessions) {
    console.log(`Session ID: ${s.id}, Title: "${s.title}", isTridinOnly: ${s.isTridinOnly}, publishState: ${s.publishState}`);
  }

  // Update all sessions to be isTridinOnly: true so candidates see them immediately
  const updateResult = await prisma.liveSession.updateMany({
    data: {
      isTridinOnly: true,
      publishState: "PUBLISHED",
    },
  });

  console.log("Updated sessions result:", updateResult);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
