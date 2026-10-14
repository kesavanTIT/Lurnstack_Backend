const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\app\\router\\router.jsx";
let content = fs.readFileSync(targetFile, "utf8");

if (!content.includes("PATHS.TRIDIN_LEARN")) {
  const needle = `<Route
        path={PATHS.TRIDIN_DASHBOARD}
        element={(
          <RequireAuth role="tridin">
            <TridinDashboardPage />
          </RequireAuth>
        )}
      />`;

  const replacement = `<Route
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

  if (content.includes(needle)) {
    content = content.replace(needle, replacement);
    fs.writeFileSync(targetFile, content, "utf8");
    console.log("Successfully patched router.jsx with TRIDIN_LEARN route!");
  } else {
    console.error("Could not find needle in router.jsx");
  }
} else {
  console.log("TRIDIN_LEARN already in router.jsx");
}
