/**
 * DIRECT FIX: Update JAVA FULL COURSE and python sessions in REMOTE DB
 * to targetAudience = TRIDIN, isTridinOnly = true
 * 
 * Run this on the REMOTE SERVER:
 * node scratch/fix-remote-sessions.js
 * 
 * OR copy the SQL and run in aaPanel > Database > SQL query
 */

const sessionIds = [
  "dd068275-4d70-4bb1-8745-cc5166dedc97", // JAVA FULL COURSE
  "7dd84f7b-ccdb-48c1-a3bf-b09c11adae32", // python
];

const sql = `
-- Fix JAVA FULL COURSE and python sessions to be Tridin-visible
UPDATE "LiveSession"
SET 
  "targetAudience" = 'TRIDIN',
  "isTridinOnly" = true,
  "publishState" = 'PUBLISHED',
  "updatedAt" = NOW()
WHERE "id" IN (
  '${sessionIds[0]}',
  '${sessionIds[1]}'
);

-- Verify
SELECT id, title, "targetAudience", "isTridinOnly", "meetingLink", "publishState"
FROM "LiveSession"
WHERE "id" IN (
  '${sessionIds[0]}',
  '${sessionIds[1]}'
);
`;

console.log("=== SQL TO RUN IN aaPanel DATABASE ===\n");
console.log(sql);

// Also try to run via prisma if this is run locally with the right DB
async function tryLocalFix() {
  try {
    const prisma = require("../src/config/db");
    const result = await prisma.liveSession.updateMany({
      where: { id: { in: sessionIds } },
      data: {
        targetAudience: "TRIDIN",
        isTridinOnly: true,
        publishState: "PUBLISHED",
      }
    });
    console.log(`\nLocal DB: Updated ${result.count} sessions`);
    
    const check = await prisma.liveSession.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true, title: true, targetAudience: true, isTridinOnly: true, meetingLink: true }
    });
    console.log("Updated sessions:", check);
    await prisma.$disconnect();
  } catch(e) {
    console.log("(Local DB not needed - run SQL above in aaPanel)");
  }
}

tryLocalFix();
