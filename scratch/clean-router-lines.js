const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\app\\router\\router.jsx";
let content = fs.readFileSync(targetFile, "utf8");
const isCrlf = content.includes("\r\n");
let lines = content.split(/\r?\n/);

// Find index where path={PATHS.TRIDIN_DASHBOARD} appears
const idx = lines.findIndex(l => l.includes("path={PATHS.TRIDIN_DASHBOARD}"));
console.log("Found TRIDIN_DASHBOARD at line:", idx + 1);

// Find the closing of this block - look for ShortsPage
const shortsIdx = lines.findIndex(l => l.includes("PATHS.SHORTS"));
console.log("Found SHORTS at line:", shortsIdx + 1);

// Replace from idx - 1 (<Route) to shortsIdx - 1
const before = lines.slice(0, idx - 1);
const after = lines.slice(shortsIdx);

const replacementLines = [
  '      <Route',
  '        path={PATHS.TRIDIN_DASHBOARD}',
  '        element={(',
  '          <RequireAuth role="tridin">',
  '            <TridinDashboardPage />',
  '          </RequireAuth>',
  '        )}',
  '      />',
  '      <Route',
  '        path={PATHS.TRIDIN_LEARN}',
  '        element={(',
  '          <RequireAuth role="tridin">',
  '            <TridinCoursePlayerPage />',
  '          </RequireAuth>',
  '        )}',
  '      />',
];

const newLines = [...before, ...replacementLines, ...after];
const eol = isCrlf ? "\r\n" : "\n";
fs.writeFileSync(targetFile, newLines.join(eol), "utf8");
console.log("Successfully replaced router lines cleanly!");
