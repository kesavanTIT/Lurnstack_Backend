const fs = require("fs");
const path = require("path");

try {
  const dirs = fs.readdirSync("/www/wwwroot");
  console.log("Directories in /www/wwwroot:");
  dirs.forEach((d) => {
    const fullPath = path.join("/www/wwwroot", d);
    const stats = fs.statSync(fullPath);
    console.log(`- ${d} (${stats.isDirectory() ? "Directory" : "File"})`);
  });
} catch (e) {
  console.error("Error reading /www/wwwroot:", e.message);
}
