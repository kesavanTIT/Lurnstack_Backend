const { getDurationSeconds } = require('../src/utils/attendanceCalculator');

const now = new Date();
const occurrence = {
  startsAt: new Date(now.getTime() - 90 * 60 * 1000), // 90 mins ago
  endsAt: new Date(now.getTime() - 30 * 60 * 1000)   // 30 mins ago
};

// Simulation 1: Student joined and left normally (7 mins)
const attNormal = {
  events: [
    {
      joinedAt: new Date(now.getTime() - 80 * 60 * 1000),
      leftAt: new Date(now.getTime() - 73 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 73 * 60 * 1000)
    }
  ]
};

// Simulation 2: Student joined but closed tab (heartbeats stopped after 7 mins, no leave triggered)
const attLoopholeClosed = {
  events: [
    {
      joinedAt: new Date(now.getTime() - 80 * 60 * 1000),
      leftAt: null,
      updatedAt: new Date(now.getTime() - 73 * 60 * 1000) // Last active heartbeat
    }
  ]
};

console.log('Simulation 1 (Normal):', getDurationSeconds(attNormal, occurrence) / 60, 'minutes');
console.log('Simulation 2 (Loophole - closed tab):', getDurationSeconds(attLoopholeClosed, occurrence) / 60, 'minutes');

const oldCalculation = (a) => {
  let totalSecs = 0;
  if (totalSecs === 0 && a.joinedAt) {
    const start = new Date(a.joinedAt).getTime();
    const end = occurrence.endsAt ? new Date(occurrence.endsAt).getTime() : start + 3600000;
    totalSecs = Math.round((end - start) / 1000);
  }
  return totalSecs;
};

// Legacy fallback simulation
const attLegacy = {
  joinedAt: new Date(now.getTime() - 80 * 60 * 1000),
  totalDurationSeconds: 0
};
console.log('Legacy Capping Calculation:', oldCalculation(attLegacy) / 60, 'minutes');
