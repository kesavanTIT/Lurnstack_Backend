/**
 * diagnose-reminders.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Run this script to diagnose why session reminders (email/SMS) are not firing.
 * 
 * Usage:  node diagnose-reminders.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

require("dotenv").config();
const prisma = require("./src/config/db");

const line = "─".repeat(60);

async function diagnose() {
  console.log("\n" + line);
  console.log("  🔍 LurnStack Reminder System Diagnostic");
  console.log(line + "\n");

  const now = new Date();
  console.log(`  🕐 Server time (UTC)  : ${now.toISOString()}`);
  console.log(`  🕐 Server time (IST)  : ${now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST\n`);

  // ── CHECK 1: Active Students ──────────────────────────────────────────────
  console.log(line);
  console.log("  CHECK 1: Active Students in Database");
  console.log(line);

  const allStudents = await prisma.user.findMany({
    where: { role: "STUDENT", isActive: true },
    select: { id: true, fullName: true, email: true, phoneNumber: true, phoneNormalized: true },
  });

  if (allStudents.length === 0) {
    console.log("  ❌ PROBLEM: Zero active students found (role=STUDENT, isActive=true)");
    console.log("     → No email or SMS can be sent if there are no students!\n");
  } else {
    console.log(`  ✅ Found ${allStudents.length} active student(s):\n`);
    allStudents.forEach((s, i) => {
      const hasEmail  = s.email          ? "✅" : "❌ MISSING";
      const hasPhone  = s.phoneNormalized ? "✅" : "❌ MISSING";
      console.log(`     [${i + 1}] ${s.fullName || "Unknown"}`);
      console.log(`         Email           : ${hasEmail} ${s.email || ""}`);
      console.log(`         phoneNormalized : ${hasPhone} ${s.phoneNormalized || "(no phone saved)"}`);
    });

    const withEmail = allStudents.filter(s => s.email).length;
    const withPhone = allStudents.filter(s => s.phoneNormalized).length;
    console.log(`\n  📊 Summary: ${withEmail}/${allStudents.length} have email | ${withPhone}/${allStudents.length} have phoneNormalized`);

    if (withPhone === 0) {
      console.log("  ⚠️  WARNING: No student has a phoneNormalized value → SMS will be skipped for ALL students.");
      console.log("     Fix: Ensure students register with a phone number so phoneNormalized is populated.");
    }
  }

  // ── CHECK 2: Published Sessions ───────────────────────────────────────────
  console.log("\n" + line);
  console.log("  CHECK 2: Published Sessions");
  console.log(line);

  const publishedSessions = await prisma.liveSession.findMany({
    where: {
      publishState: "PUBLISHED",
      status: { notIn: ["cancelled", "ended"] },
    },
    select: {
      id: true, title: true, startTime: true, endTime: true,
      isRecurring: true, pricingState: true, publishState: true, status: true,
    },
  });

  if (publishedSessions.length === 0) {
    console.log("  ❌ PROBLEM: No PUBLISHED sessions found.");
    console.log("     → Admin must publish the session before reminders can fire.\n");
  } else {
    console.log(`  ✅ Found ${publishedSessions.length} published session(s):\n`);
    publishedSessions.forEach((s, i) => {
      console.log(`     [${i + 1}] "${s.title}"`);
      console.log(`         pricingState : ${s.pricingState}`);
      console.log(`         status       : ${s.status}`);
      console.log(`         startTime    : ${s.startTime || "⚠️  NOT SET"}`);
      console.log(`         endTime      : ${s.endTime   || "⚠️  NOT SET"}`);
      console.log(`         isRecurring  : ${s.isRecurring}`);
    });
  }

  // ── CHECK 3: SessionOccurrence Records ────────────────────────────────────
  console.log("\n" + line);
  console.log("  CHECK 3: SessionOccurrence Records");
  console.log(line);

  const allOccurrences = await prisma.sessionOccurrence.findMany({
    include: {
      session: { select: { title: true, publishState: true, status: true } },
    },
    orderBy: { startsAt: "asc" },
    take: 20,
  });

  if (allOccurrences.length === 0) {
    console.log("  ❌ PROBLEM: No SessionOccurrence records exist at all!");
    console.log("     → The reminderJob looks for occurrences, but there are none.");
    console.log("     → Fix: Re-publish the session (the publish step now regenerates occurrences).\n");
  } else {
    console.log(`  ℹ️  Found ${allOccurrences.length} occurrence(s) (showing up to 20):\n`);
    allOccurrences.forEach((o, i) => {
      const startsAt   = new Date(o.startsAt);
      const diffMs     = startsAt.getTime() - now.getTime();
      const diffMin    = Math.round(diffMs / 60000);
      const isPast     = diffMs < 0;
      const isIn10Min  = diffMin >= 10 && diffMin < 11;

      const timeLabel  = isPast
        ? `⏰ ${Math.abs(diffMin)} min AGO (past!)`
        : `⏰ in ${diffMin} min`;

      const reminderFlag = o.reminderSent ? "✅ already sent" : "⏳ pending";

      console.log(`     [${i + 1}] Session: "${o.session?.title}"`);
      console.log(`         occurrenceId   : ${o.id}`);
      console.log(`         startsAt (IST) : ${startsAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
      console.log(`         Time from now  : ${timeLabel}${isIn10Min ? " ← 🎯 IN REMINDER WINDOW!" : ""}`);
      console.log(`         status         : ${o.status}`);
      console.log(`         reminderSent   : ${reminderFlag}`);
      console.log(`         session.publish: ${o.session?.publishState}`);
      console.log(`         session.status : ${o.session?.status}`);
      console.log("");
    });
  }

  // ── CHECK 4: What the Cron Would See RIGHT NOW ────────────────────────────
  console.log(line);
  console.log("  CHECK 4: What the Cron Sees Right NOW (10-min window simulation)");
  console.log(line);

  const windowStart = new Date(now.getTime() + 10 * 60 * 1000);
  const windowEnd   = new Date(now.getTime() + 11 * 60 * 1000);

  console.log(`  Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);

  const cronView = await prisma.sessionOccurrence.findMany({
    where: {
      reminderSent: false,
      startsAt: { gte: windowStart, lt: windowEnd },
      status: "scheduled",
      session: {
        publishState: "PUBLISHED",
        status: { notIn: ["cancelled", "ended"] },
      },
    },
    include: {
      session: { select: { title: true } },
    },
  });

  if (cronView.length === 0) {
    console.log("\n  ❌ RESULT: Cron would find ZERO occurrences right now.");
    console.log("     → This is why no reminders fired.\n");
    console.log("  💡 WHAT TO DO:");
    console.log("     1. Check Check-3 above — is the occurrence startsAt in the past?");
    console.log("     2. Re-publish the session from Admin panel to regenerate occurrences.");
    console.log("     3. The session's startTime must be exactly 10 min from NOW when the cron ticks.");
    console.log("     4. Check that students have email/phoneNormalized (Check-1 above).\n");
  } else {
    console.log(`\n  ✅ Cron would find ${cronView.length} occurrence(s) — reminder SHOULD fire soon:`);
    cronView.forEach((o) => {
      console.log(`     → "${o.session?.title}" at ${new Date(o.startsAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
    });
    console.log("\n  If you still see no messages, the problem is in Check-1 (no students/phones).\n");
  }

  // ── CHECK 5: Environment Variables ───────────────────────────────────────
  console.log(line);
  console.log("  CHECK 5: Environment Variables");
  console.log(line);

  const checks = [
    ["FAST2SMS_API_KEY", process.env.FAST2SMS_API_KEY],
    ["FAST2SMS_ROUTE",   process.env.FAST2SMS_ROUTE],
    ["SMS_MOCK_MODE",    process.env.SMS_MOCK_MODE],
    ["SMTP_HOST",        process.env.SMTP_HOST],
    ["SMTP_FROM",        process.env.SMTP_FROM],
    ["FRONTEND_URL",     process.env.FRONTEND_URL],
  ];

  checks.forEach(([key, val]) => {
    if (!val) {
      console.log(`  ❌ ${key.padEnd(20)} : NOT SET`);
    } else if (key === "FAST2SMS_API_KEY") {
      console.log(`  ✅ ${key.padEnd(20)} : ${"*".repeat(10)} (set, ${val.length} chars)`);
    } else {
      console.log(`  ✅ ${key.padEnd(20)} : ${val}`);
    }
  });

  if (process.env.SMS_MOCK_MODE === "true") {
    console.log("\n  ⚠️  SMS_MOCK_MODE=true → Real SMS will NOT be sent, only logged to console.");
    console.log("     Set SMS_MOCK_MODE=false in .env to send real SMS.\n");
  }

  console.log("\n" + line);
  console.log("  Diagnostic complete.");
  console.log(line + "\n");

  await prisma.$disconnect();
}

diagnose().catch((e) => {
  console.error("Diagnostic script error:", e.message);
  prisma.$disconnect();
  process.exit(1);
});
