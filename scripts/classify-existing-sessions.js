const prisma = require("../src/config/db");

async function main() {
  console.log("Starting session classification...");

  // 1. Any session that has Tridin videos is a RECORDED_COURSE
  const videoCourses = await prisma.liveSession.findMany({
    where: {
      tridinVideos: { some: {} },
    },
    select: { id: true, title: true, _count: { select: { tridinVideos: true } } },
  });

  console.log(`Found ${videoCourses.length} session(s) with videos. Marking as RECORDED_COURSE...`);
  for (const vc of videoCourses) {
    await prisma.liveSession.update({
      where: { id: vc.id },
      data: {
        sessionType: "RECORDED_COURSE",
        sectionType: "TRIDIN_COURSE",
        source: "tridin_video_course",
        isRecurring: false,
      },
    });
    console.log(`  ✓ Marked "${vc.title}" (${vc._count.tridinVideos} videos) as RECORDED_COURSE`);
  }

  // 2. Any session with 0 videos and has recurrence or live timing is a LIVE_CLASS
  const liveClasses = await prisma.liveSession.findMany({
    where: {
      tridinVideos: { none: {} },
      OR: [
        { isRecurring: true },
        { startTime: { not: null } },
        { meetingLink: { not: null } },
      ],
    },
    select: { id: true, title: true },
  });

  console.log(`Found ${liveClasses.length} live session(s) with 0 videos. Marking as LIVE_CLASS...`);
  for (const lc of liveClasses) {
    await prisma.liveSession.update({
      where: { id: lc.id },
      data: {
        sessionType: "LIVE_CLASS",
      },
    });
    console.log(`  ✓ Marked "${lc.title}" as LIVE_CLASS`);
  }

  console.log("Classification completed successfully!");
}

main()
  .catch((e) => {
    console.error("Classification error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

