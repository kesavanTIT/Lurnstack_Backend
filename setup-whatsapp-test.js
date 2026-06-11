/**
 * setup-whatsapp-test.js
 * 
 * Helper script to set up data for testing WhatsApp reminders.
 * Usage: node setup-whatsapp-test.js <YOUR_PHONE_NUMBER>
 * Example: node setup-whatsapp-test.js +919876543210
 */

require('dotenv').config();
const prisma = require('./src/config/db');

async function main() {
  const phoneInput = process.argv[2];
  if (!phoneInput) {
    console.error('❌ Please provide a phone number to update the test student with.');
    console.error('Usage: node setup-whatsapp-test.js <PHONE_NUMBER>');
    process.exit(1);
  }

  console.log(`Setting up test student with phone: ${phoneInput}...`);

  // 1. Normalize and update the test student (id: 45)
  const cleanPhone = phoneInput.replace(/[\s\+\-\(\)]/g, "");
  const normalized = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  const student = await prisma.user.update({
    where: { id: 45 },
    data: {
      phoneNumber: phoneInput,
      phoneNormalized: normalized,
      isActive: true
    }
  });

  console.log(`✅ Updated student: ${student.fullName} (ID: ${student.id})`);
  console.log(`   phone: ${student.phoneNumber} | phoneNormalized: ${student.phoneNormalized}`);

  // 2. Create a test live session starting in 4 minutes
  const now = new Date();
  const startsAt = new Date(now.getTime() + 4 * 60 * 1000); // 4 minutes from now
  const endsAt = new Date(now.getTime() + 64 * 60 * 1000); // 64 minutes from now

  console.log(`Creating test session occurrence starting at ${startsAt.toLocaleTimeString()} (local time)...`);

  // Ensure test trainer exists (id: 44)
  const trainer = await prisma.user.findUnique({ where: { id: 44 } });
  if (!trainer) {
    console.error('❌ Test trainer (id: 44) not found. Run migrations or seeds first.');
    process.exit(1);
  }

  // Create a new LiveSession
  const session = await prisma.liveSession.create({
    data: {
      title: 'WhatsApp Reminder Test Session',
      subtitle: 'Testing Meta WhatsApp Cloud API Integration',
      description: 'This is a test session created to verify automated WhatsApp reminders.',
      trainerId: trainer.id,
      courseId: 'test-course-id',
      courseTitle: 'Verification Course',
      startTime: startsAt.toTimeString().split(' ')[0].substring(0, 5), // "HH:MM"
      endTime: endsAt.toTimeString().split(' ')[0].substring(0, 5),
      pricingState: 'FREE',
      publishState: 'PUBLISHED',
      status: 'active',
      isRecurring: false
    }
  });

  // Create a SessionOccurrence for the session
  const occurrence = await prisma.sessionOccurrence.create({
    data: {
      courseId: 'test-course-id',
      sessionId: session.id,
      trainerId: trainer.id,
      occurrenceDate: new Date(startsAt.toISOString().split('T')[0] + 'T00:00:00.000Z'),
      startsAt,
      endsAt,
      status: 'scheduled',
      reminderSent: false
    }
  });

  console.log(`✅ Created Live Session: "${session.title}" (ID: ${session.id})`);
  console.log(`✅ Created Session Occurrence (ID: ${occurrence.id}) starting at ${occurrence.startsAt.toISOString()}`);
  console.log('\n🎉 Setup complete! Keep the backend server running.');
  console.log('The background WhatsApp job should detect this session and send a notification within 1 minute.');
}

main().catch(err => {
  console.error('❌ Error during setup:', err);
}).finally(() => {
  prisma.$disconnect();
});
