const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\app\\router\\paths.js";
let content = fs.readFileSync(targetFile, "utf8");

if (!content.includes("TRIDIN_LEARN")) {
  content = content.replace(
    'TRIDIN_DASHBOARD: "/tridin",',
    'TRIDIN_DASHBOARD: "/tridin",\n  TRIDIN_LEARN: "/tridin/course/:sessionId/learn",'
  );
  fs.writeFileSync(targetFile, content, "utf8");
  console.log("Added TRIDIN_LEARN to paths.js");
} else {
  console.log("TRIDIN_LEARN already exists in paths.js");
}
