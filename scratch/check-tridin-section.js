const fs = require("fs");

// Read the current TridinCurriculumSection.jsx
const filePath = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\TridinCurriculumSection.jsx";
const content = fs.readFileSync(filePath, "utf8");

// Check what's in it currently
console.log("File length:", content.length);
console.log("--- First 200 chars ---");
console.log(content.substring(0, 200));
console.log("--- Lines count ---");
console.log(content.split("\n").length);
