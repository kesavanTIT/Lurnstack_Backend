const { resolveFinalStatus } = require('../src/services/adminAttendance.service');

// Mock occurrences
const liveOccurrence = {
  startsAt: new Date(Date.now() - 30 * 60 * 1000), // started 30 mins ago
  endsAt: new Date(Date.now() + 30 * 60 * 1000),   // ends in 30 mins
  status: 'live'
};

const endedOccurrence = {
  startsAt: new Date(Date.now() - 90 * 60 * 1000), // started 90 mins ago
  endsAt: new Date(Date.now() - 30 * 60 * 1000),   // ended 30 mins ago
  status: 'completed',
  finalizedAt: new Date()
};

// Helper for testing
function runTest(testName, input, expected) {
  const result = resolveFinalStatus(input);
  if (result === expected) {
    console.log(`[PASS] ${testName}`);
  } else {
    console.error(`[FAIL] ${testName}: Expected "${expected}", got "${result}"`);
    process.exitCode = 1;
  }
}

console.log('Running resolveFinalStatus unit tests...');

// 1. Live class, student has joined, DB status is "pending"
runTest(
  'Live class - joined student pending status',
  {
    studentAttendance: { status: 'pending', firstJoinedAt: liveOccurrence.startsAt },
    attendance: { status: 'pending', firstJoinedAt: liveOccurrence.startsAt },
    occurrence: liveOccurrence
  },
  'pending'
);

// 2. Live class, student has joined, DB status has been updated to "present"
runTest(
  'Live class - joined student present status',
  {
    studentAttendance: { status: 'present', firstJoinedAt: liveOccurrence.startsAt },
    attendance: { status: 'present', firstJoinedAt: liveOccurrence.startsAt },
    occurrence: liveOccurrence
  },
  'present'
);

// 3. Ended class, student duration (e.g. 5 mins) is less than threshold (e.g. 18 mins)
// 60-min session duration, 30% threshold = 18 mins (1080 seconds)
runTest(
  'Ended class - duration < threshold should be absent',
  {
    studentAttendance: { status: 'pending', firstJoinedAt: endedOccurrence.startsAt },
    attendance: {
      status: 'pending',
      firstJoinedAt: endedOccurrence.startsAt,
      totalDurationSeconds: 300 // 5 minutes
    },
    occurrence: endedOccurrence
  },
  'absent'
);

// 4. Ended class, student duration is 0
runTest(
  'Ended class - duration is 0 should be absent',
  {
    studentAttendance: { status: 'pending', firstJoinedAt: endedOccurrence.startsAt },
    attendance: {
      status: 'pending',
      firstJoinedAt: endedOccurrence.startsAt,
      totalDurationSeconds: 0
    },
    occurrence: endedOccurrence
  },
  'absent'
);

// 5. Ended class, student duration (e.g. 25 mins) >= threshold (e.g. 18 mins)
runTest(
  'Ended class - duration >= threshold (joined on time) should be present',
  {
    studentAttendance: { status: 'pending', firstJoinedAt: endedOccurrence.startsAt },
    attendance: {
      status: 'pending',
      firstJoinedAt: endedOccurrence.startsAt,
      totalDurationSeconds: 1500 // 25 minutes
    },
    occurrence: endedOccurrence
  },
  'present'
);

// 6. Ended class, student duration >= threshold, but joined late (> 15 mins after start)
const lateJoinTime = new Date(endedOccurrence.startsAt.getTime() + 20 * 60 * 1000);
runTest(
  'Ended class - duration >= threshold (joined late) should be late',
  {
    studentAttendance: { status: 'pending', firstJoinedAt: lateJoinTime },
    attendance: {
      status: 'pending',
      firstJoinedAt: lateJoinTime,
      totalDurationSeconds: 1500
    },
    occurrence: endedOccurrence
  },
  'late'
);

// 7. Manual override
runTest(
  'Manual override - present',
  {
    studentAttendance: { status: 'present', source: 'admin_manual' },
    attendance: { status: 'pending' },
    occurrence: endedOccurrence
  },
  'present'
);

console.log('All tests finished.');
