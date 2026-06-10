const prisma = require('../src/config/db');
const studentController = require('../src/controllers/studentController');

async function testFlow() {
  console.log("Cleaning old test data...");
  await prisma.attendanceEvent.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.studentAttendance.deleteMany({});
  await prisma.sessionOccurrence.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.liveSession.deleteMany({});
  await prisma.user.deleteMany({});

  // 1. Create a trainer and a student
  const trainer = await prisma.user.create({
    data: {
      fullName: "Test Trainer",
      email: "trainer@test.com",
      password: "hashedpassword",
      role: "TRAINER"
    }
  });

  const student = await prisma.user.create({
    data: {
      fullName: "Test Student",
      email: "student@test.com",
      password: "hashedpassword",
      role: "STUDENT"
    }
  });

  // 2. Create a session
  const now = new Date();
  const session = await prisma.liveSession.create({
    data: {
      title: "Test Live Session",
      trainerId: trainer.id,
      startTime: "10:00",
      endTime: "11:00",
      timezone: "Asia/Kolkata",
      status: "active",
      publishState: "PUBLISHED",
      pricingState: "FREE"
    }
  });

  // Mock express request/response objects for joinSession
  const reqJoin = {
    user: { id: student.id },
    params: { sessionId: session.id },
    body: {
      clientJoinedAt: new Date().toISOString()
    }
  };

  let joinResponseData = null;
  const resJoin = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.jsonData = data;
      joinResponseData = data;
      return this;
    }
  };

  console.log("Testing POST /api/student/sessions/:sessionId/join...");
  await studentController.joinSession(reqJoin, resJoin);
  console.log("Join response status:", resJoin.statusCode);
  console.log("Join response JSON:", JSON.stringify(joinResponseData, null, 2));

  // Verify the database records
  const attendances = await prisma.attendance.findMany({
    where: { studentId: student.id, sessionId: session.id }
  });
  console.log("Created Attendance records in DB:", attendances);

  const studentAttendances = await prisma.studentAttendance.findMany({
    where: { studentId: student.id, sessionId: session.id }
  });
  console.log("Created StudentAttendance records in DB:", studentAttendances);

  const occurrences = await prisma.sessionOccurrence.findMany({
    where: { sessionId: session.id }
  });
  console.log("Created SessionOccurrence records in DB:", occurrences);

  // Now, test GET /api/student/sessions
  const reqGet = {
    user: { id: student.id },
    query: {}
  };

  let getResponseData = null;
  const resGet = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.jsonData = data;
      getResponseData = data;
      return this;
    }
  };

  console.log("\nTesting GET /api/student/sessions...");
  await studentController.getStudentSessions(reqGet, resGet);
  console.log("Get sessions response status:", resGet.statusCode);
  console.log("Get sessions response first item:", JSON.stringify(getResponseData.data[0], null, 2));
}

testFlow().catch(err => {
  console.error("Test flow error:", err);
}).finally(() => {
  prisma.$disconnect();
});
