const fs = require("fs");
const targetFile = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\TridinCurriculumSection.jsx";

let content = fs.readFileSync(targetFile, "utf8");

// ── 1. Update fetchCourses to load both Tridin courses AND all trainer sessions ──
const oldFetchCourses = `  const fetchCourses = async () => {
    setLoadingCourses(true);
    try {
      const res = await axiosClient.get("/api/trainer/tridin/courses");
      const list = res.data?.courses || [];
      setCourses(list);
      if (list.length > 0 && !selectedCourseId) {
        setSelectedCourseId(list[0].id);
      }
    } catch (err) {
      console.error("Error loading Tridin courses:", err);
    } finally {
      setLoadingCourses(false);
    }
  };`;

const newFetchCourses = `  const fetchCourses = async () => {
    setLoadingCourses(true);
    try {
      // 1. Fetch Tridin courses
      let tridinList = [];
      try {
        const res = await axiosClient.get("/api/trainer/tridin/courses");
        tridinList = res.data?.courses || [];
      } catch (e) {
        console.warn("Tridin courses fetch error:", e?.message);
      }

      // 2. Also fetch all trainer live sessions so trainer can select ANY course
      let regularSessions = [];
      try {
        const sessRes = await axiosClient.get("/api/trainer/my-sessions").catch(() => axiosClient.get("/api/trainer/sessions"));
        const data = sessRes.data?.data || sessRes.data?.sessions || sessRes.data || [];
        regularSessions = Array.isArray(data) ? data : [];
      } catch (e) {
        console.warn("Trainer sessions fetch error:", e?.message);
      }

      // Merge and deduplicate by ID
      const map = new Map();
      tridinList.forEach((c) => map.set(String(c.id), { ...c, isTridin: true }));
      regularSessions.forEach((s) => {
        const sid = String(s.id);
        if (!map.has(sid)) {
          map.set(sid, {
            id: s.id,
            title: s.title || s.classTitle || s.courseTitle || "Course Session",
            courseTitle: s.courseTitle || s.title,
            category: s.category || "General",
            _count: { tridinVideos: s._count?.tridinVideos || 0 },
            isTridin: Boolean(s.isTridinOnly),
          });
        }
      });

      const combined = Array.from(map.values());
      setCourses(combined);
      if (combined.length > 0) {
        setSelectedCourseId((prev) => prev || combined[0].id);
      }
    } catch (err) {
      console.error("Error loading courses:", err);
    } finally {
      setLoadingCourses(false);
    }
  };`;

if (content.includes("const fetchCourses = async () => {")) {
  // Replace fetchCourses function
  const startIdx = content.indexOf("const fetchCourses = async () => {");
  const endIdx = content.indexOf("const fetchCourseVideos = async", startIdx);
  if (startIdx !== -1 && endIdx !== -1) {
    content = content.slice(0, startIdx) + newFetchCourses.trim() + "\n\n  " + content.slice(endIdx);
    console.log("1. Successfully updated fetchCourses to combine Tridin & regular trainer courses!");
  }
}

// ── 2. Add Quick Create Course State & Handler ──
if (!content.includes("quickCourseTitle")) {
  const stateNeedle = "const [videoModalOpen, setVideoModalOpen] = useState(false);";
  const newState = `const [quickCourseTitle, setQuickCourseTitle] = useState("");
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);`;
  content = content.replace(stateNeedle, newState);

  const handlerCode = `
  const handleQuickCreateCourse = async (e) => {
    e?.preventDefault();
    if (!quickCourseTitle.trim()) return;
    setCreatingCourse(true);
    try {
      const res = await axiosClient.post("/api/trainer/sessions", {
        title: quickCourseTitle.trim(),
        category: "Tridin",
        isTridinOnly: true,
        startTime: "10:00 AM",
        endTime: "11:00 AM",
        timezone: "Asia/Kolkata",
        isRecurring: true,
      });
      const newSess = res.data?.data || res.data?.session || res.data;
      if (newSess?.id) {
        setQuickCourseTitle("");
        await fetchCourses();
        setSelectedCourseId(newSess.id);
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to create Tridin course.");
    } finally {
      setCreatingCourse(false);
    }
  };
`;
  content = content.replace("const handleSaveVideo = async (e) => {", handlerCode + "\n  const handleSaveVideo = async (e) => {");
  console.log("2. Successfully added handleQuickCreateCourse handler!");
}

// ── 3. Add Course Selector inside the Video Modal ──
const modalCourseSelector = `              {/* ── Course Selector inside Modal ── */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Target Course *
                </label>
                <select
                  required
                  value={selectedCourseId}
                  onChange={(e) => {
                    setSelectedCourseId(e.target.value);
                    setVideoError("");
                  }}
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-gray-900 focus:border-[#004d3d] focus:bg-white focus:outline-none"
                >
                  <option value="" disabled>-- Select Course --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title || c.courseTitle} ({c.category || "Tridin"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Video Title *`;

if (!content.includes("Target Course *") && content.includes("Video Title *")) {
  content = content.replace(`              <div>\n                <label className="block text-xs font-bold text-gray-700 mb-1">\n                  Video Title *`, modalCourseSelector);
  console.log("3. Successfully injected Target Course dropdown into Add Video Modal!");
}

// ── 4. Replace the empty amber box in Top Bar with an Interactive Course Selector + Quick Add ──
const oldAmberBox = `<div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                No Tridin courses found. Please create a course session with "isTridinOnly" enabled first.
              </div>`;

const newCourseBar = `<div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Type new course name (e.g. Python for Tridin)..."
                  value={quickCourseTitle}
                  onChange={(e) => setQuickCourseTitle(e.target.value)}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800 focus:border-[#004d3d] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleQuickCreateCourse}
                  disabled={creatingCourse || !quickCourseTitle.trim()}
                  className="rounded-xl bg-[#004d3d] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#00392d] disabled:opacity-50 whitespace-nowrap shadow-sm"
                >
                  {creatingCourse ? "Creating..." : "+ Create Course"}
                </button>
              </div>`;

if (content.includes('No Tridin courses found')) {
  // Find the amber box block
  const amberStart = content.indexOf('<div className="text-xs text-amber-700 bg-amber-50');
  if (amberStart !== -1) {
    const amberEnd = content.indexOf('</div>', amberStart) + 6;
    content = content.slice(0, amberStart) + newCourseBar + content.slice(amberEnd);
    console.log("4. Successfully replaced amber box with interactive Create Course input!");
  }
}

fs.writeFileSync(targetFile, content, "utf8");
console.log("All frontend enhancements saved to TridinCurriculumSection.jsx!");
