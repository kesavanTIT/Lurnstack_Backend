/**
 * regenerate-occurrences.js
 * 
 * Run this script to reset and regenerate occurrences for ALL active published sessions
 * so that they can send Email and WhatsApp reminders again.
 * 
 * Usage: node regenerate-occurrences.js
 */

require('dotenv').config();
const prisma = require('./src/config/db');
const { generateOccurrences } = require('./src/services/occurrenceService');

async function main() {
  console.log('🔍 Fetching all active published sessions...');

  const activeSessions = await prisma.liveSession.findMany({
    where: {
      publishState: 'PUBLISHED',
      status: 'active'
    }
  });

  console.log(`Found ${activeSessions.length} active published sessions.`);

  for (const session of activeSessions) {
    console.log(`\n⏳ Processing session: "${session.title}" (ID: ${session.id})`);

    // 1. Delete all existing occurrences for this session
    const deleted = await prisma.sessionOccurrence.deleteMany({
      where: { sessionId: session.id }
    });
    console.log(`   - Deleted ${deleted.count} old occurrences.`);

    // 2. Delete existing WhatsApp reminder logs for this session so they can receive WhatsApp messages again
    const deletedReminders = await prisma.whatsAppReminder.deleteMany({
      where: { sessionId: session.id }
    });
    console.log(`   - Cleared ${deletedReminders.count} old WhatsApp reminder logs.`);

    // 3. Reset booking reminder flags if any
    const updatedBookings = await prisma.booking.updateMany({
      where: { sessionId: session.id },
      data: {
        whatsappReminderSentAt: null,
        whatsappReminderStatus: null,
        whatsappReminderMessageId: null,
        whatsappReminderError: null
      }
    });
    console.log(`   - Reset ${updatedBookings.count} booking reminder flags.`);

    // 4. Regenerate occurrences treating "today" as the base start date
    const sessionForOccurrence = {
      ...session,
      createdAt: new Date() // Treat today as the base date for occurrence generation
    };

    const count = await generateOccurrences(sessionForOccurrence, session.isRecurring ? 30 : 1);
    console.log(`   - Generated ${count || 0} new future occurrences starting from today.`);
  }

  console.log('\n✅ All occurrences and reminder states regenerated successfully!');
}

main().catch(err => {
  console.error('❌ Error during regeneration:', err);
}).finally(() => {
  prisma.$disconnect();
});
