require('dotenv').config();
const nodemailer = require("nodemailer");

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const host = "smtp.zeptomail.in";

async function testConfig(name, config) {
  console.log(`\nTesting Config: ${name}...`);
  const transporter = nodemailer.createTransport(config);

  try {
    await transporter.verify();
    console.log(`✅ Success for ${name}!`);
    return true;
  } catch (error) {
    console.error(`❌ Failed for ${name}:`, error.message);
    return false;
  }
}

async function run() {
  // Test 1: Standard TLS (Port 587, secure: false)
  await testConfig("Port 587 / secure: false", {
    host,
    port: 587,
    secure: false,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  // Test 2: Port 587 with requireTLS
  await testConfig("Port 587 / secure: false / requireTLS", {
    host,
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  // Test 3: SSL (Port 465, secure: true)
  await testConfig("Port 465 / secure: true", {
    host,
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

run();
