const assert = require('assert');

// 1. Define weekdays array
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// 2. Helper function to test matchesRecurringDays logic
const matchesRecurringDays = (session, date) => {
  if (!session.isRecurring) return true;
  
  let daysArray = [];
  if (session.recurringDays) {
    if (Array.isArray(session.recurringDays)) {
      daysArray = session.recurringDays;
    } else {
      try {
        daysArray = typeof session.recurringDays === "string"
          ? JSON.parse(session.recurringDays)
          : session.recurringDays;
      } catch (e) {}
    }
  }

  const weekdayStr = date.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });
  const weekday = weekdays.indexOf(weekdayStr);

  if (Array.isArray(daysArray) && daysArray.length > 0) {
    return daysArray.includes(weekday);
  } else if (session.recurrenceType === "weekly") {
    const createDayStr = new Date(session.createdAt).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });
    const createDayOfWeekKolkata = weekdays.indexOf(createDayStr);
    return weekday === createDayOfWeekKolkata;
  }
  return true;
};

// 3. Test Cases
console.log("Running weekday filter checks...");

const session1 = {
  isRecurring: true,
  recurringDays: [1, 2, 3, 4], // Mon-Thu
  createdAt: new Date('2026-06-15T00:00:00.000Z') // Monday
};

// Test with Friday (June 19, 2026) -> should be FALSE
const targetFriday = new Date('2026-06-19T10:00:00+05:30'); 
assert.strictEqual(matchesRecurringDays(session1, targetFriday), false, "Friday should be filtered out.");
console.log("✅ Friday filtered out successfully.");

// Test with Monday (June 15, 2026) -> should be TRUE
const targetMonday = new Date('2026-06-15T10:00:00+05:30'); 
assert.strictEqual(matchesRecurringDays(session1, targetMonday), true, "Monday should be allowed.");
console.log("✅ Monday matched successfully.");

const session2 = {
  isRecurring: true,
  recurringDays: null,
  recurrenceType: "weekly",
  createdAt: new Date('2026-06-15T00:00:00.000Z') // Monday
};

// Fallback test: match Monday -> should be TRUE
assert.strictEqual(matchesRecurringDays(session2, targetMonday), true, "Fallback: Monday matches creation day.");
console.log("✅ Fallback: Monday matched successfully.");

// Fallback test: match Friday -> should be FALSE
assert.strictEqual(matchesRecurringDays(session2, targetFriday), false, "Fallback: Friday does not match creation day.");
console.log("✅ Fallback: Friday filtered out successfully.");

console.log("🚀 All asserts passed successfully!");
