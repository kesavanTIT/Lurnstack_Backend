const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function seedTestData() {
  console.log("🌱 Starting Certificate Test Data Seeding...");

  try {
    // 1. Ensure Global Certificate Settings
    let settings = await prisma.certificateSettings.findFirst();
    if (!settings) {
      settings = await prisma.certificateSettings.create({
        data: {
          freeThreshold: 75,
          certificatePricePaise: 29900, // ₹299
        },
      });
      console.log("✅ Created CertificateSettings");
    } else {
      settings = await prisma.certificateSettings.update({
        where: { id: settings.id },
        data: { freeThreshold: 75, certificatePricePaise: 29900 },
      });
      console.log("✅ Updated CertificateSettings to 75% free threshold");
    }

    // 2. Find or Create a Trainer
    const trainerEmail = "trainer_cert@lurnstack.com";
    let trainer = await prisma.user.findUnique({ where: { email: trainerEmail } });
    if (!trainer) {
      const password = await bcrypt.hash("password123", 10);
      trainer = await prisma.user.create({
        data: {
          fullName: "Expert Trainer",
          email: trainerEmail,
          password,
          role: "TRAINER",
        },
      });
      console.log(`✅ Created Trainer: ${trainer.email}`);
    }

    // 3. Find or Create a Test Student
    const studentEmail = "student_cert@lurnstack.com";
    let student = await prisma.user.findUnique({ where: { email: studentEmail } });
    if (!student) {
      const password = await bcrypt.hash("password123", 10);
      student = await prisma.user.create({
        data: {
          fullName: "HORA JENCY. S",
          email: studentEmail,
          password,
          role: "STUDENT",
        },
      });
      console.log(`✅ Created Test Student: ${student.email}`);
    }

    // 4. Create Mock Courses (LiveSessions)
    const courses = [
      { courseId: "C-PY-260505", title: "Python Programming", expectedPct: 100 }, // MATCH EXACT
    ];

    for (const c of courses) {
      let session = await prisma.liveSession.findFirst({ where: { courseId: c.courseId } });
      if (!session) {
        session = await prisma.liveSession.create({
          data: {
            courseId: c.courseId,
            courseTitle: c.title,
            title: c.title,
            trainerId: trainer.id,
            status: "active",
            publishState: "PUBLISHED",
          },
        });
        console.log(`✅ Created Course: ${c.title}`);
      }

      // Generate 15 Occurrences from 05 May 2026 to 19 May 2026
      const totalSessions = 15;
      const attendedCount = Math.floor((c.expectedPct / 100) * totalSessions);
      
      const existingOccurrences = await prisma.sessionOccurrence.count({ where: { sessionId: session.id } });
      
      if (existingOccurrences === 0) {
        // Start date: May 5, 2026
        const startDate = new Date("2026-05-05T10:00:00Z");

        for (let i = 0; i < totalSessions; i++) {
          const occDate = new Date(startDate);
          occDate.setDate(startDate.getDate() + i);

          const occurrence = await prisma.sessionOccurrence.create({
            data: {
              sessionId: session.id,
              courseId: session.courseId,
              trainerId: trainer.id,
              occurrenceDate: occDate,
              startsAt: occDate,
              endsAt: new Date(occDate.getTime() + 60 * 60000), // +1 hour
              status: "completed",
            },
          });

          // Create Attendance Record for this student if they attended
          if (i < attendedCount) {
            await prisma.studentAttendance.create({
              data: {
                courseId: session.courseId,
                sessionId: session.id,
                occurrenceId: occurrence.id,
                occurrenceDate: occurrence.occurrenceDate,
                studentId: student.id,
                trainerId: trainer.id,
                status: "present",
                joinCount: 1,
              },
            });
          } else {
             // Create absent record
             await prisma.studentAttendance.create({
              data: {
                courseId: session.courseId,
                sessionId: session.id,
                occurrenceId: occurrence.id,
                occurrenceDate: occurrence.occurrenceDate,
                studentId: student.id,
                trainerId: trainer.id,
                status: "absent",
                joinCount: 0,
              },
            });
          }
        }
        console.log(`✅ Created ${totalSessions} Occurrences for ${c.title}. Student attended ${attendedCount} (${c.expectedPct}%).`);
      } else {
        console.log(`⚠️ Occurrences already exist for ${c.title}. Skipping...`);
      }
    }

    console.log("\n🎉 Seeding Complete!");
    console.log("\n--- TEST CREDENTIALS ---");
    console.log(`Student Email: ${studentEmail}`);
    console.log(`Password: password123`);
    console.log(`Login via frontend to test your certificate portal!`);
    console.log("--------------------------\n");

  } catch (error) {
    console.error("❌ Error seeding test data:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seedTestData();
