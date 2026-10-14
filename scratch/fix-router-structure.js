const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\app\\router\\router.jsx";
let content = fs.readFileSync(targetFile, "utf8");

// Revert back if it has the nested one
const badNested = `      <Route
        path={PATHS.TRIDIN_LEARN}
        element={(
          <RequireAuth role="tridin">
            <TridinCoursePlayerPage />
          </RequireAuth>
        )}
      />`;

content = content.replace(badNested, "");

// Clean target block
const dashboardRouteBlock = `<Route
        path={PATHS.TRIDIN_DASHBOARD}
        element={(
          <RequireAuth role="tridin">
            <TridinDashboardPage />
          </RequireAuth>
        )}
      />`;

const correctReplacement = `<Route
        path={PATHS.TRIDIN_DASHBOARD}
        element={(
          <RequireAuth role="tridin">
            <TridinDashboardPage />
          </RequireAuth>
        )}
      />
      <Route
        path={PATHS.TRIDIN_LEARN}
        element={(
          <RequireAuth role="tridin">
            <TridinCoursePlayerPage />
          </RequireAuth>
        )}
      />`;

// Replace normalizing newlines
const normalizedContent = content.replace(/\r\n/g, "\n");
const normalizedTarget = dashboardRouteBlock.replace(/\r\n/g, "\n");
const normalizedReplacement = correctReplacement.replace(/\r\n/g, "\n");

if (normalizedContent.includes(normalizedTarget)) {
  const result = normalizedContent.replace(normalizedTarget, normalizedReplacement);
  // Restore CRLF
  fs.writeFileSync(targetFile, result.replace(/\n/g, "\r\n"), "utf8");
  console.log("Successfully fixed router.jsx structure!");
} else {
  console.error("Could not find dashboardRouteBlock in router.jsx");
}
