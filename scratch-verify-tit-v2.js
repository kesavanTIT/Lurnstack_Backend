/**
 * scratch-verify-tit-v2.js
 * 
 * End-to-end integration verification for the updated Unified TIT Classes flow.
 */

require('dotenv').config();
const prisma = require('./src/config/db');
const { createLiveClass, getLiveClasses } = require('./src/controllers/adminController');
const { getPendingReviewSessions, reviewAndPublishSession } = require('./src/controllers/sessionReminderController');
const { getStudentTITClasses } = require('./src/controllers/studentController');

// Helper to create mock request and response objects
const createMockRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    jsonData: null,
    status: function (code) {
      this.statusCode = code;
      return this;
    },
    json: function (data) {
      this.jsonData = data;
      return this;
    },
    setHeader: function (name, value) {
      this.headers[name] = value;
      return this;
    }
  };
  return res;
};

async function main() {
  console.log('🚀 Starting end-to-end verification for Unified TIT Classes flow (v2)...');

  // Ensure we have a Trainer user in the database
  let trainer = await prisma.user.findFirst({ where: { role: 'TRAINER' } });
  if (!trainer) {
    console.log('No trainer found, creating a test trainer...');
    trainer = await prisma.user.create({
      data: {
        fullName: 'Infant Trainer',
        email: 'trainer.infant@example.com',
        password: 'password123',
        role: 'TRAINER',
        isActive: true
      }
    });
  }
  console.log(`Using trainer: ${trainer.fullName} (ID: ${trainer.id})`);

  // Clean up any old verification sessions
  await prisma.liveSession.deleteMany({
    where: {
      courseTitle: 'Verification TIT Course v2'
    }
  });

  // 1. Create a TIT session via admin controller
  console.log('\n--- Step 1: Creating TIT class via createLiveClass controller ---');
  const reqCreate = {
    body: {
      sectionType: 'TIT',
      sessionType: 'TIT',
      source: 'admin_tit_classes',
      createdByRole: 'admin',
      requiresAdminReview: true,
      publishState: 'DRAFT',
      pricingState: 'PENDING_PRICE',
      courseName: 'Verification TIT Course v2',
      classTitle: 'Verification TIT Title v2',
      instructor: trainer.fullName,
      description: 'Verification TIT description v2',
      date: '2026-06-12',
      startTime: '10:30 AM',
      endTime: '11:30 AM',
      time: '10:30 AM',
      duration: '1 Hour',
      meetLink: 'https://meet.google.com/verify-test-v2'
    },
    protocol: 'http',
    get: (header) => 'localhost:5000'
  };
  const resCreate = createMockRes();

  await createLiveClass(reqCreate, resCreate);
  console.log('Create Response Code:', resCreate.statusCode);
  console.log('Create Response Data keys:', Object.keys(resCreate.jsonData.data));

  if (resCreate.statusCode !== 201 || !resCreate.jsonData.success) {
    throw new Error('❌ Failed to create TIT class');
  }

  const createdSessionId = resCreate.jsonData.data.id;
  console.log(`✅ TIT Class created successfully. Session ID: ${createdSessionId}`);

  // Check database representation
  const dbSession = await prisma.liveSession.findUnique({
    where: { id: createdSessionId }
  });
  console.log('Created dbSession state:', {
    id: dbSession.id,
    publishState: dbSession.publishState,
    pricingState: dbSession.pricingState,
    sectionType: dbSession.sectionType,
    sessionType: dbSession.sessionType,
    source: dbSession.source,
    createdByRole: dbSession.createdByRole,
    requiresAdminReview: dbSession.requiresAdminReview
  });

  if (dbSession.publishState !== 'DRAFT' || 
      dbSession.pricingState !== 'PENDING_PRICE' ||
      dbSession.sectionType !== 'TIT' ||
      dbSession.sessionType !== 'TIT' ||
      dbSession.source !== 'admin_tit_classes' ||
      dbSession.createdByRole !== 'admin' ||
      dbSession.requiresAdminReview !== true) {
    throw new Error('❌ LiveSession properties were not saved correctly');
  }

  // 2. Fetch pending review list
  console.log('\n--- Step 2: Fetching pending review sessions ---');
  const resPending = createMockRes();
  await getPendingReviewSessions({}, resPending);
  
  const foundInPending = resPending.jsonData.data.find(s => s.id === createdSessionId);
  if (!foundInPending) {
    throw new Error('❌ Created TIT session not found in pending review list');
  }
  console.log('✅ Found session in pending-review:', foundInPending);

  // 3. Admin list endpoint check
  console.log('\n--- Step 3: Fetching admin live classes list ---');
  const reqAdminList = {
    protocol: 'http',
    get: () => 'localhost:5000'
  };
  const resAdminList = createMockRes();
  await getLiveClasses(reqAdminList, resAdminList);

  const foundInAdminList = resAdminList.jsonData.data.find(s => s.id === createdSessionId);
  if (!foundInAdminList) {
    throw new Error('❌ Created TIT session not found in admin live classes list');
  }
  console.log('✅ Found session in get-live-classes list:', foundInAdminList);

  // 4. Verify student TITClasses returns empty since not published yet
  console.log('\n--- Step 4: Check student TIT Classes list (should NOT return unpublished) ---');
  const reqStudentList = {
    protocol: 'http',
    get: () => 'localhost:5000'
  };
  const resStudentListBefore = createMockRes();
  await getStudentTITClasses(reqStudentList, resStudentListBefore);
  const foundInStudentBefore = resStudentListBefore.jsonData.data.find(s => s.id === createdSessionId);
  if (foundInStudentBefore) {
    throw new Error('❌ Student retrieved TIT session before it was published');
  }
  console.log('✅ Correctly omitted from student TIT classes (unpublished)');

  // 5. Review and publish the session
  console.log('\n--- Step 5: Pricing and Review/Publishing the session ---');
  const reqPublish = {
    params: { sessionId: createdSessionId },
    body: { price: 49900, notes: 'Approved for ₹499' }
  };
  const resPublish = createMockRes();
  await reviewAndPublishSession(reqPublish, resPublish);
  console.log('Publish Response:', resPublish.jsonData);

  if (resPublish.statusCode !== 200 || !resPublish.jsonData.success) {
    throw new Error('❌ Failed to publish session');
  }

  // Check database after publish
  const dbSessionAfter = await prisma.liveSession.findUnique({
    where: { id: createdSessionId }
  });
  console.log('Published dbSession state:', {
    id: dbSessionAfter.id,
    publishState: dbSessionAfter.publishState,
    pricingState: dbSessionAfter.pricingState,
    priceInPaise: dbSessionAfter.priceInPaise
  });

  if (dbSessionAfter.publishState !== 'PUBLISHED' || dbSessionAfter.pricingState !== 'PRICED') {
    throw new Error('❌ LiveSession pricing state/publishState was not updated correctly after review');
  }

  // 6. Verify student TITClasses returns the session now that it is published
  console.log('\n--- Step 6: Check student TIT Classes list (should return published with exact keys) ---');
  const resStudentListAfter = createMockRes();
  await getStudentTITClasses(reqStudentList, resStudentListAfter);
  const foundInStudentAfter = resStudentListAfter.jsonData.data.find(s => s.id === createdSessionId);
  if (!foundInStudentAfter) {
    throw new Error('❌ Student could not find the published TIT session');
  }
  console.log('✅ Found published session in student list:', foundInStudentAfter);

  // Validate exact response keys:
  const expectedKeys = [
    'id', 'courseId', 'courseName', 'title', 'classTitle', 'instructor', 'description',
    'date', 'startTime', 'endTime', 'time', 'duration', 'meetingLink', 'meetLink',
    'thumbnail', 'priceInPaise', 'currency', 'isFree', 'publishState', 'pricingState'
  ];

  for (const key of expectedKeys) {
    if (!(key in foundInStudentAfter)) {
      throw new Error(`❌ Missing expected key in student response: ${key}`);
    }
  }
  console.log('✅ All expected keys are present in student response!');

  // Cleanup database
  await prisma.liveSession.delete({ where: { id: createdSessionId } });
  console.log('✅ Cleaned up test session from database.');

  console.log('\n🎉 ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
}

main()
  .catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
