const { execSync } = require("child_process");

try {
  console.log("=== PM2 List as www user ===");
  console.log(execSync("sudo -u www pm2 list 2>&1").toString());
} catch (e) {
  console.log("pm2 error:", e.message);
}
