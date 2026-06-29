const prisma = require('../src/config/db');

async function main() {
  console.log('Testing Category model...');
  try {
    const categories = await prisma.category.findMany();
    console.log(`Success: Found ${categories.length} categories.`);
  } catch (err) {
    console.error('Category error:', err.message);
  }

  console.log('\nTesting Offer model...');
  try {
    const offers = await prisma.offer.findMany();
    console.log(`Success: Found ${offers.length} offers.`);
  } catch (err) {
    console.error('Offer error:', err.message);
  }

  console.log('\nTesting PromoPoster model...');
  try {
    const posters = await prisma.promoPoster.findMany();
    console.log(`Success: Found ${posters.length} posters.`);
  } catch (err) {
    console.error('PromoPoster error:', err.message);
  }
}

main().catch(err => {
  console.error('Main error:', err);
}).finally(() => {
  prisma.$disconnect();
});
