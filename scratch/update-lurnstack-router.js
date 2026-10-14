const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\app\\router\\router.jsx";
let content = fs.readFileSync(targetFile, "utf8");

if (!content.includes("TridinCoursePlayerPage")) {
  // Add import
  content = content.replace(
    'import TridinDashboardPage from "../../pages/TridinDashboardPage";',
    'import TridinDashboardPage from "../../pages/TridinDashboardPage";\nimport TridinCoursePlayerPage from "../../pages/TridinCoursePlayerPage";'
  );

  // Add route
  const targetRoute = `      <Route
        path={PATHS.TRIDIN_DASHBOARD}
        element={(
          <RequireAuth role="tridin">
            <TridinDashboardPage />
          </RequireAuth>
        )}
      />`;

  const newRoutes = `      <Route
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

  content = content.replace(targetRoute, newRoutes);
  fs.writeFileSync(targetFile, content, "utf8");
  console.log("Successfully added TridinCoursePlayerPage to router.jsx");
} else {
  console.log("TridinCoursePlayerPage already in router.jsx");
}
