const fs = require("fs");

const pagePath = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\pages\\TrainerDashboardPage.jsx";
const apiPath = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\recurring\\api\\trainerSessionsApi.js";

const pageContent = fs.readFileSync(pagePath, "utf8");
const apiContent = fs.readFileSync(apiPath, "utf8");

console.log("=== Page handleChange check ===");
const handleChangeIdx = pageContent.indexOf("const handleChange =");
if (handleChangeIdx !== -1) {
  console.log(pageContent.substring(handleChangeIdx, handleChangeIdx + 700));
}

console.log("\n=== API normalizeSessionPayload check ===");
const normIdx = apiContent.indexOf("function normalizeSessionPayload(");
if (normIdx !== -1) {
  console.log(apiContent.substring(normIdx, normIdx + 1200));
}
