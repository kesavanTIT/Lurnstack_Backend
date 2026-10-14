const fs = require("fs");
const path = require("path");

const adminRoot = "D:\\ADMIN\\LurnStack-Admin";

// ── 1. Patch App.js ──
const appJsPath = path.join(adminRoot, "src", "App.js");
let appJs = fs.readFileSync(appJsPath, "utf8");

if (!appJs.includes("TridinCandidates")) {
  // Add import
  appJs = `import TridinCandidates from './pages/tridin/TridinCandidates';\n` + appJs;

  // Add route after students
  const studentRoute = `<Route path="students" element={<Students />} />`;
  const newRoutes = `<Route path="students" element={<Students />} />\n          <Route path="tridin-candidates" element={<TridinCandidates />} />`;

  appJs = appJs.replace(studentRoute, newRoutes);
  fs.writeFileSync(appJsPath, appJs, "utf8");
  console.log("Patched App.js with TridinCandidates route!");
} else {
  console.log("TridinCandidates already in App.js");
}

// ── 2. Patch Sidebar.jsx ──
const sidebarPath = path.join(adminRoot, "src", "components", "Sidebar.jsx");
let sidebar = fs.readFileSync(sidebarPath, "utf8");

if (!sidebar.includes("Tridin Candidates")) {
  // Ensure Key is imported from lucide-react
  if (!sidebar.includes("Key,")) {
    sidebar = sidebar.replace("Users,", "Users,\n  Key,");
  }

  // Add nav item after Students
  const studentsNav = "{ name: 'Students', path: '/students', icon: Users },";
  const newNav = "{ name: 'Students', path: '/students', icon: Users },\n  { name: 'Tridin Candidates', path: '/tridin-candidates', icon: Key },";

  sidebar = sidebar.replace(studentsNav, newNav);
  fs.writeFileSync(sidebarPath, sidebar, "utf8");
  console.log("Patched Sidebar.jsx with Tridin Candidates menu item!");
} else {
  console.log("Tridin Candidates already in Sidebar.jsx");
}
