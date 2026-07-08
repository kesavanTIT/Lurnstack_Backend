require('dotenv').config();

const pass = process.env.SMTP_PASS;
if (!pass) {
  console.log("SMTP_PASS is not set!");
} else {
  console.log(`Length: ${pass.length}`);
  console.log(`Value: "${pass}"`);
  console.log("Characters and char codes:");
  for (let i = 0; i < pass.length; i++) {
    console.log(`[${i}] ${pass[i]} -> ${pass.charCodeAt(i)}`);
  }
}
