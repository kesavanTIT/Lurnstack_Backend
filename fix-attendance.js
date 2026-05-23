const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Starting Attendance Cleanup...");

  // 1. Fetch all attendance records
  const attendances = await prisma.attendance.findMany();
  console.log(`Found ${attendances.length} total attendance records.`);

  // 2. Safely map legacy joinDate to the new occurrenceDate
  let updateCount = 0;
  for (const att of attendances) {
    if (att.joinDate) {
      // Parse the old string date into a proper DateTime
      const parsedDate = new Date(att.joinDate);
      // Ensure it's a valid date
      if (!isNaN(parsedDate.getTime())) {
        await prisma.attendance.update({
          where: { id: att.id },
          data: { occurrenceDate: parsedDate }
        });
        updateCount++;
      }
    }
  }
  console.log(`Restored correct occurrenceDate for ${updateCount} legacy records.`);

  // 3. Find and delete exact duplicates based on the new unique constraint rule
  // We only want ONE record per student, per session, per day
  const updatedAttendances = await prisma.attendance.findMany();
  const uniqueMap = new Map();
  const toDelete = [];

  for (const att of updatedAttendances) {
    // Normalize date to string (YYYY-MM-DD) for exact daily comparison
    const dateStr = att.occurrenceDate.toISOString().split('T')[0];
    const uniqueKey = `${att.studentId}-${att.sessionId}-${dateStr}`;

    if (uniqueMap.has(uniqueKey)) {
      // This is a duplicate! Mark for deletion
      toDelete.push(att.id);
    } else {
      // First time seeing this combination, keep it
      uniqueMap.set(uniqueKey, true);
    }
  }

  // 4. Delete the duplicates safely
  if (toDelete.length > 0) {
    console.log(`Found ${toDelete.length} duplicate rows. Deleting them safely...`);
    await prisma.attendance.deleteMany({
      where: { id: { in: toDelete } }
    });
    console.log("✅ Duplicates deleted successfully!");
  } else {
    console.log("✅ No duplicates found. Your database is perfectly clean!");
  }

  console.log("Cleanup script finished successfully.");
}

main()
  .catch((e) => {
    console.error("An error occurred during cleanup:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
