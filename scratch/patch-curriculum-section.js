const fs = require("fs");

const filePath = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\TridinCurriculumSection.jsx";
let content = fs.readFileSync(filePath, "utf8");

// ── Patch 1: Add videoUploadTab to state and videoFile handling ──────────────

// Replace the videoForm state initialization (in openAddVideoModal)
content = content.replace(
  `    setVideoForm({
      title: "",
      description: "",
      videoUrl: "",
      durationMinutes: 10,
      thumbnailFile: null,
      thumbnailPreview: "",
    });
    setVideoError("");
    setVideoModalOpen(true);`,
  `    setVideoUploadTab("youtube");
    setVideoFile(null);
    setVideoFilePreview("");
    setUploadProgress(0);
    setVideoForm({
      title: "",
      description: "",
      videoUrl: "",
      durationMinutes: 10,
      thumbnailFile: null,
      thumbnailPreview: "",
    });
    setVideoError("");
    setVideoModalOpen(true);`
);

// Replace openEditVideoModal
content = content.replace(
  `    setVideoForm({
      title: video.title || "",
      description: video.description || "",
      videoUrl: video.videoUrl || "",
      durationMinutes: Math.round((video.durationSeconds || 0) / 60) || 10,
      thumbnailFile: null,
      thumbnailPreview: video.thumbnailUrl || "",
    });
    setVideoError("");
    setVideoModalOpen(true);`,
  `    setVideoUploadTab(video.videoType === "UPLOAD" ? "file" : "youtube");
    setVideoFile(null);
    setVideoFilePreview(video.videoType === "UPLOAD" ? (video.videoUrl || "") : "");
    setUploadProgress(0);
    setVideoForm({
      title: video.title || "",
      description: video.description || "",
      videoUrl: video.videoType !== "UPLOAD" ? (video.videoUrl || "") : "",
      durationMinutes: Math.round((video.durationSeconds || 0) / 60) || 10,
      thumbnailFile: null,
      thumbnailPreview: video.thumbnailUrl || "",
    });
    setVideoError("");
    setVideoModalOpen(true);`
);

// ── Patch 2: Replace handleSaveVideo to support file upload ──────────────────
const oldSave = `  const handleSaveVideo = async (e) => {
    e.preventDefault();
    if (!videoForm.title.trim() || !videoForm.videoUrl.trim()) {
      setVideoError("Please provide a Title and Video URL.");
      return;
    }

    setSavingVideo(true);
    setVideoError("");

    try {
      const formData = new FormData();
      formData.append("title", videoForm.title.trim());
      formData.append("description", videoForm.description.trim());
      formData.append("videoUrl", videoForm.videoUrl.trim());
      formData.append("durationSeconds", String((Number(videoForm.durationMinutes) || 1) * 60));

      if (videoForm.thumbnailFile) {
        formData.append("thumbnail", videoForm.thumbnailFile);
      }

      if (editingVideo) {
        await axiosClient.put(\`/api/trainer/tridin/videos/\${editingVideo.id}\`, formData);
      } else {
        await axiosClient.post(\`/api/trainer/tridin/courses/\${selectedCourseId}/videos\`, formData);
      }

      setVideoModalOpen(false);
      fetchCourseVideos(selectedCourseId);
    } catch (err) {
      console.error("Save video error:", err);
      setVideoError(err.response?.data?.message || "Failed to save video.");
    } finally {
      setSavingVideo(false);
    }
  };`;

const newSave = `  const handleSaveVideo = async (e) => {
    e.preventDefault();
    if (!videoForm.title.trim()) {
      setVideoError("Please provide a Video Title.");
      return;
    }
    if (videoUploadTab === "youtube" && !videoForm.videoUrl.trim()) {
      setVideoError("Please provide a YouTube or video URL.");
      return;
    }
    if (videoUploadTab === "file" && !videoFile && !editingVideo) {
      setVideoError("Please select a video file to upload.");
      return;
    }

    setSavingVideo(true);
    setVideoError("");
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("title", videoForm.title.trim());
      formData.append("description", videoForm.description.trim());
      formData.append("durationSeconds", String((Number(videoForm.durationMinutes) || 1) * 60));

      if (videoUploadTab === "file" && videoFile) {
        // Direct file upload
        formData.append("videoFile", videoFile);
      } else if (videoUploadTab === "youtube") {
        // YouTube / direct URL
        formData.append("videoUrl", videoForm.videoUrl.trim());
      }

      if (videoForm.thumbnailFile) {
        formData.append("thumbnail", videoForm.thumbnailFile);
      }

      const config = {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          const pct = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setUploadProgress(pct);
        },
      };

      if (editingVideo) {
        await axiosClient.put(\`/api/trainer/tridin/videos/\${editingVideo.id}\`, formData, config);
      } else {
        await axiosClient.post(\`/api/trainer/tridin/courses/\${selectedCourseId}/videos\`, formData, config);
      }

      setUploadProgress(100);
      setVideoModalOpen(false);
      fetchCourseVideos(selectedCourseId);
    } catch (err) {
      console.error("Save video error:", err);
      setVideoError(err.response?.data?.message || "Failed to save video.");
    } finally {
      setSavingVideo(false);
    }
  };`;

if (content.includes(oldSave)) {
  content = content.replace(oldSave, newSave);
  console.log("✅ handleSaveVideo patched!");
} else {
  console.log("❌ handleSaveVideo target not found - checking snippet...");
  const idx = content.indexOf("const handleSaveVideo");
  console.log("Found at:", idx);
  console.log(content.substring(idx, idx + 200));
}

// ── Patch 3: Add new state variables after existing state declarations ────────
const stateInsertAfter = `  const [savingVideo, setSavingVideo] = useState(false);
  const [videoError, setVideoError] = useState("");`;

const stateInsertWith = `  const [savingVideo, setSavingVideo] = useState(false);
  const [videoError, setVideoError] = useState("");
  // Direct file upload state
  const [videoUploadTab, setVideoUploadTab] = useState("youtube"); // "youtube" | "file"
  const [videoFile, setVideoFile] = useState(null);
  const [videoFilePreview, setVideoFilePreview] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);`;

if (content.includes(stateInsertAfter)) {
  content = content.replace(stateInsertAfter, stateInsertWith);
  console.log("✅ State variables added!");
} else {
  console.log("❌ State insert point not found");
}

fs.writeFileSync(filePath, content, "utf8");
console.log("✅ File written successfully!");
