const fs = require("fs");
const file = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\pages\\TrainerDashboardPage.jsx";
const content = fs.readFileSync(file, "utf8");

const idx = content.indexOf("formWithCalculatedHours =");
console.log(JSON.stringify(content.substring(idx - 50, idx + 250)));
