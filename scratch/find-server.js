const { execSync } = require("child_process");

try {
  console.log("=== PM2 List ===");
  console.log(execSync("pm2 list 2>&1 || echo 'pm2 not running'").toString());
} catch (e) {
  console.log("pm2 error:", e.message);
}

try {
  console.log("=== Node processes ===");
  console.log(execSync("ps aux | grep node | grep -v grep").toString());
} catch (e) {
  console.log("No node processes found");
}

try {
  console.log("=== Port 3000 listener ===");
  console.log(execSync("lsof -i :3000 2>&1 || ss -tlnp | grep 3000").toString());
} catch (e) {
  console.log("No listener on 3000:", e.message);
}

try {
  console.log("=== Port 5000 listener ===");
  console.log(execSync("lsof -i :5000 2>&1 || ss -tlnp | grep 5000").toString());
} catch (e) {
  console.log("No listener on 5000:", e.message);
}
