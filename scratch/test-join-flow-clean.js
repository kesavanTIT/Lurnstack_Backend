const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient(); // No query logs!

// Mock/override the DB module in node's require cache so controllers use this clean prisma instance
require.cache[require.resolve('../src/config/db')] = {
  exports: prisma
};

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
      startTime: "15:00",
      endTime: "16:30",
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
  console.log("Created Attendance records in DB count:", attendances.length);
  if (attendances.length > 0) {
    console.log("Attendance record detail:", JSON.stringify(attendances[0], null, 2));
  }

  const studentAttendances = await prisma.studentAttendance.findMany({
    where: { studentId: student.id, sessionId: session.id }
  });
  console.log("Created StudentAttendance records in DB count:", studentAttendances.length);
  if (studentAttendances.length > 0) {
    console.log("StudentAttendance record detail:", JSON.stringify(studentAttendances[0], null, 2));
  }

  const occurrences = await prisma.sessionOccurrence.findMany({
    where: { sessionId: session.id }
  });
  console.log("Created SessionOccurrence records in DB count:", occurrences.length);

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
  console.log("Get sessions response first item isJoined:", getResponseData.data[0]?.isJoined);

  // 3. Mark session as ended and verify it's still returned
  console.log("\nMarking session as ended in database...");
  await prisma.liveSession.update({
    where: { id: session.id },
    data: { status: "ended" }
  });

  console.log("Testing GET /api/student/sessions (after session ended)...");
  let getResponseDataEnded = null;
  const resGetEnded = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.jsonData = data;
      getResponseDataEnded = data;
      return this;
    }
  };
  await studentController.getStudentSessions(reqGet, resGetEnded);
  console.log("Get sessions (ended) response status:", resGetEnded.statusCode);
  console.log("Get sessions (ended) response count:", getResponseDataEnded.data.length);
  if (getResponseDataEnded.data.length > 0) {
    console.log("Get sessions (ended) response first item title:", getResponseDataEnded.data[0]?.title);
    console.log("Get sessions (ended) response first item status:", getResponseDataEnded.data[0]?.status);
  }
}

testFlow().catch(err => {
  console.error("Test flow error:", err);
}).finally(() => {
  prisma.$disconnect();
});
