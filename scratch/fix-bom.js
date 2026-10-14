const fs = require("fs");

const files = [
  "D:\\lurn_t\\LurnStack-Trainer\\src\\app\\router\\paths.js",
  "D:\\lurn_t\\LurnStack-Trainer\\src\\app\\router\\router.jsx",
  "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\dashboardRoutes.js",
];

files.forEach((f) => {
  let c = fs.readFileSync(f, "utf8");
  if (c.charCodeAt(0) === 0xfeff) {
    c = c.slice(1);
    fs.writeFileSync(f, c, "utf8");
    console.log("Removed BOM from:", f);
  } else {
    console.log("No BOM in:", f);
  }
});
console.log("Done!");
