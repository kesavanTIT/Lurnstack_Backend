const fs = require("fs");
const file = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\pages\\TrainerDashboardPage.jsx";
const content = fs.readFileSync(file, "utf8");

const idx = content.indexOf("const handleChange =");
console.log(JSON.stringify(content.substring(idx, idx + 450)));
