const fs = require("fs");
const filePath = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\TridinCurriculumSection.jsx";

let content = fs.readFileSync(filePath, "utf8");

// Fix 1: Remove BOM if present
content = content.replace(/^\uFEFF/, "");

// Fix 2: Fix wrong import path (../../ -> ../../../ because file is 3 levels deep from src/)
content = content.replace(
  "from \"../../shared/api/axiosClient\"",
  "from \"../../../shared/api/axiosClient\""
);

// Fix 3: Remove unused FiClock import
content = content.replace("  FiClock,\n", "");

// Fix 4: Remove unused FiLayers import
content = content.replace("  FiLayers,\n", "");

// Fix 5: Suppress exhaustive-deps for fetch on mount
content = content.replace(
  "  useEffect(() => {\n    fetchCourses();\n  }, []);",
  "  // eslint-disable-next-line react-hooks/exhaustive-deps\n  useEffect(() => { fetchCourses(); }, []);"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Fixed TridinCurriculumSection.jsx successfully!");
