const fs = require("fs");
const path = require("path");

const target = "/www/wwwroot/lurnstack.com";
try {
  const files = fs.readdirSync(target);
  console.log(`Contents of ${target}:`);
  files.forEach((f) => {
    const fullPath = path.join(target, f);
    const stats = fs.statSync(fullPath);
    console.log(`- ${f} (${stats.isDirectory() ? "Directory" : "File"}, Size: ${stats.size}, LastModified: ${stats.mtime})`);
  });
} catch (e) {
  console.error(`Error reading ${target}:`, e.message);
}
