const prisma = require('../src/config/db');
const certificateService = require('../src/services/certificate.service');

async function main() {
  console.log('=== TESTING CERTIFICATE ELIGIBILITY & GENERATION ===');
  
  // Find a student
  const student = await prisma.user.findFirst({ where: { role: 'STUDENT' } });
  // Find a completed/ended session
  const session = await prisma.liveSession.findFirst({ where: { status: 'ended' } });
  
  console.log('Student:', student?.id, student?.fullName);
  console.log('Session:', session?.id, session?.title);

  if (student && session) {
    const eligibility = await certificateService.checkEligibility(student.id, session.id);
    console.log('Eligibility result:', JSON.stringify(eligibility, null, 2));

    try {
      const dates = await certificateService.getCourseDates(session.id);
      console.log('Course Dates:', dates);
    } catch (e) {
      console.error('getCourseDates Error:', e);
    }
  }

  const settings = await prisma.certificateSettings.findFirst();
  console.log('CertificateSettings in DB:', settings);
}

main()
  .catch(err => console.error('MAIN ERROR:', err))
  .finally(() => prisma.$disconnect());
