require('dotenv').config();
const path = require('path');
const assert = require('assert');

// 1. Mock Prisma client to intercept DB queries
const mockPrisma = {
  liveSession: {
    findFirst: async () => null
  },
  studentAttendance: {
    count: async () => 0
  },
  sessionOccurrence: {
    count: async () => 0
  },
  booking: {
    findFirst: async () => null
  }
};

const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: mockPrisma
};

// 2. Load the certificate service
const certificateService = require('../src/services/certificate.service');

async function runTests() {
  console.log('=== Running Certificate Rule Tests ===\n');

  // Test Case 1: Paid Session - Purchased & Attended 1 session
  {
    mockPrisma.liveSession.findFirst = async () => ({
      id: 'session-paid',
      courseId: 'course-paid',
      pricingState: 'PRICED',
      priceInPaise: 49900
    });
    mockPrisma.studentAttendance.count = async () => 1;
    mockPrisma.booking.findFirst = async () => ({ id: 'booking-paid' });
    mockPrisma.sessionOccurrence.count = async () => 5;

    const result = await certificateService.checkEligibility(123, 'course-paid');
    console.log('TC1 (Paid Session - Purchased & Attended 1):', result);
    assert.strictEqual(result.status, 'ELIGIBLE');
    assert.strictEqual(result.type, 'PAID');
  }

  // Test Case 2: Paid Session - Purchased but 0 attendance (immediate unlock)
  {
    mockPrisma.liveSession.findFirst = async () => ({
      id: 'session-paid',
      courseId: 'course-paid',
      pricingState: 'PRICED',
      priceInPaise: 49900
    });
    mockPrisma.studentAttendance.count = async () => 0;
    mockPrisma.booking.findFirst = async () => ({ id: 'booking-paid' });

    const result = await certificateService.checkEligibility(123, 'course-paid');
    console.log('TC2 (Paid Session - Purchased & 0 Attendance):', result);
    assert.strictEqual(result.status, 'ELIGIBLE');
    assert.strictEqual(result.type, 'PAID');
    assert.strictEqual(result.attended, 0);
  }

  // Test Case 3: Paid Session - Not Purchased but Attended 1
  {
    mockPrisma.liveSession.findFirst = async () => ({
      id: 'session-paid',
      courseId: 'course-paid',
      pricingState: 'PRICED',
      priceInPaise: 49900
    });
    mockPrisma.studentAttendance.count = async () => 1;
    mockPrisma.booking.findFirst = async () => null;

    const result = await certificateService.checkEligibility(123, 'course-paid');
    console.log('TC3 (Paid Session - Not Purchased & Attended 1):', result);
    assert.strictEqual(result.status, 'INELIGIBLE');
    assert.strictEqual(result.type, 'PAID');
  }

  // Test Case 4: Free Session - Attended 3 sessions & Trainer Ended
  {
    mockPrisma.liveSession.findFirst = async () => ({
      id: 'session-free',
      courseId: 'course-free',
      pricingState: 'FREE',
      priceInPaise: 0,
      endedAt: new Date()
    });
    mockPrisma.studentAttendance.count = async () => 3;
    mockPrisma.sessionOccurrence.count = async () => 10;

    const result = await certificateService.checkEligibility(123, 'course-free');
    console.log('TC4 (Free Session - Attended 3 & Ended):', result);
    assert.strictEqual(result.status, 'ELIGIBLE');
    assert.strictEqual(result.type, 'FREE');
    assert.strictEqual(result.attended, 3);
  }

  // Test Case 4b: Free Session - Attended 3 sessions but NOT Ended
  {
    mockPrisma.liveSession.findFirst = async () => ({
      id: 'session-free',
      courseId: 'course-free',
      pricingState: 'FREE',
      priceInPaise: 0,
      endedAt: null,
      status: 'active'
    });
    mockPrisma.studentAttendance.count = async () => 3;
    mockPrisma.sessionOccurrence.count = async () => 10;

    const result = await certificateService.checkEligibility(123, 'course-free');
    console.log('TC4b (Free Session - Attended 3 but NOT Ended):', result);
    assert.strictEqual(result.status, 'INCOMPLETE');
    assert.strictEqual(result.type, 'FREE');
    assert.strictEqual(result.attended, 3);
  }

  // Test Case 5: Free Session - Attended 2 sessions
  {
    mockPrisma.liveSession.findFirst = async () => ({
      id: 'session-free',
      courseId: 'course-free',
      pricingState: 'FREE',
      priceInPaise: 0,
      endedAt: new Date()
    });
    mockPrisma.studentAttendance.count = async () => 2;
    mockPrisma.sessionOccurrence.count = async () => 10;

    const result = await certificateService.checkEligibility(123, 'course-free');
    console.log('TC5 (Free Session - Attended 2):', result);
    assert.strictEqual(result.status, 'INELIGIBLE');
    assert.strictEqual(result.type, 'FREE');
    assert.strictEqual(result.attended, 2);
  }

  console.log('\n✅ All tests passed successfully!');
}

runTests().catch(err => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
