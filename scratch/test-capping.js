const { getDurationSeconds } = require('../src/utils/attendanceCalculator');

// Mock occurrence ending in 2020
const occurrence = {
  startsAt: new Date('2020-07-11T10:50:00.000Z'),
  endsAt: new Date('2020-07-11T11:50:00.000Z') // Max possible duration: 60 mins (3600 seconds)
};

// Helper for testing
function runTest(testName, attendance, expectedSeconds) {
  const result = getDurationSeconds(attendance, occurrence);
  if (result === expectedSeconds) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName}: Expected ${expectedSeconds} seconds, got ${result} seconds`);
    process.exitCode = 1;
  }
}

console.log('Running getDurationSeconds capping tests...');

// Test Case 1: Event leftAt is null, but student was active (updatedAt) past class end time.
// Event started at 10:55, endsAt is 11:50.
// Student was active until 12:05 (past class end).
// Event leftAt is null. So dynamic cap should cap at 11:50 (55 mins = 3300 seconds).
const mockAttendanceNullLeft = {
  events: [
    {
      joinedAt: new Date('2020-07-11T10:55:00.000Z'),
      leftAt: null,
      updatedAt: new Date('2020-07-11T12:05:00.000Z')
    }
  ],
  totalDurationSeconds: 0
};
runTest('Null leftAt (active past end) capped at endsAt', mockAttendanceNullLeft, 3300);

// Test Case 2: Event leftAt is set, but it is past class end time (e.g. 12:09 PM).
// Event started at 10:55, leftAt is 12:09 PM.
// Expected capped duration: 55 mins (3300 seconds).
const mockAttendanceWithLateLeft = {
  events: [
    {
      joinedAt: new Date('2020-07-11T10:55:00.000Z'),
      leftAt: new Date('2020-07-11T12:09:00.000Z'),
      updatedAt: new Date('2020-07-11T12:09:00.000Z')
    }
  ],
  totalDurationSeconds: 4440 // 74 mins stored in database
};
runTest('Set leftAt (past class end) capped at endsAt, bypassing DB fallback', mockAttendanceWithLateLeft, 3300);

// Test Case 3: Fallback capping when events is empty.
// Stored totalDurationSeconds in DB is 78 mins (4680 seconds) for a 60 min class.
// Expected output capped at max possible: 60 mins (3600 seconds).
const mockAttendanceNoEvents = {
  events: [],
  totalDurationSeconds: 4680 // 78 mins
};
runTest('Fallback database value capped at max class length', mockAttendanceNoEvents, 3600);

console.log('All tests finished.');
