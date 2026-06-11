const prisma = require('./src/config/db');

async function main() {
  console.log('--- WhatsApp Reminders ---');
  const reminders = await prisma.whatsAppReminder.findMany();
  console.log(reminders);
}

main().catch(err => {
  console.error(err);
}).finally(() => {
  prisma.$disconnect();
});
