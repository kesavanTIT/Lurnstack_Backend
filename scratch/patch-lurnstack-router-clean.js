const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\app\\router\\router.jsx";
let content = fs.readFileSync(targetFile, "utf8");

if (!content.includes("PATHS.TRIDIN_LEARN")) {
  const needle = 'path={PATHS.TRIDIN_DASHBOARD}';
  const pos = content.indexOf(needle);
  if (pos !== -1) {
    // Find the closing of this Route: />
    const closePos = content.indexOf("/>", pos);
    if (closePos !== -1) {
      const insertionPoint = closePos + 2;
      const routeStr = '\n      <Route\n        path={PATHS.TRIDIN_LEARN}\n        element={(\n          <RequireAuth role="tridin">\n            <TridinCoursePlayerPage />\n          </RequireAuth>\n        )}\n      />';
      content = content.slice(0, insertionPoint) + routeStr + content.slice(insertionPoint);
      fs.writeFileSync(targetFile, content, "utf8");
      console.log("Successfully inserted TRIDIN_LEARN route into router.jsx!");
    } else {
      console.log("Could not find closing />");
    }
  } else {
    console.log("Could not find needle");
  }
} else {
  console.log("PATHS.TRIDIN_LEARN already present");
}
