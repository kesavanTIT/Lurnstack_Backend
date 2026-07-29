const todayStr = '2026-07-29';
const recurrenceEndDate = '2026-07-29';

console.log('Today:', todayStr);
console.log('Recurrence End Date:', recurrenceEndDate);
console.log('Is today > recurrenceEndDate?', todayStr > recurrenceEndDate); // false!

const yesterdayStr = '2026-07-28';
console.log('If recurrenceEndDate changed to 2026-07-28:');
console.log('Is today > yesterdayStr?', todayStr > yesterdayStr); // true!
