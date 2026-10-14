const fs = require("fs");
const path = require("path");

const targetFile = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\TridinCurriculumSection.jsx";

const content = `import React, { useEffect, useState } from "react";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiEdit,
  FiHelpCircle,
  FiLayers,
  FiPlay,
  FiPlus,
  FiTrash2,
  FiUpload,
  FiVideo,
  FiX,
  FiYoutube,
} from "react-icons/fi";
import { axiosClient } from "../../shared/api/axiosClient";

export default function TridinCurriculumSection() {
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState("curriculum"); // "curriculum" | "analytics"
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Video Modal State
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [videoForm, setVideoForm] = useState({
    title: "",
    description: "",
    videoUrl: "",
    durationMinutes: 10,
    thumbnailFile: null,
    thumbnailPreview: "",
  });
  const [savingVideo, setSavingVideo] = useState(false);
  const [videoError, setVideoError] = useState("");

  // Assessment Modal State
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [targetVideo, setTargetVideo] = useState(null);
  const [quizForm, setQuizForm] = useState({
    title: "",
    passingScore: 70,
    timeLimitMinutes: 15,
    questions: [
      {
        questionText: "",
        options: ["", "", "", ""],
        correctOption: 0,
        explanation: "",
      },
    ],
  });
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [quizError, setQuizError] = useState("");
  const [quizSuccess, setQuizSuccess] = useState("");

  // Fetch Trainer Tridin Courses on Mount
  useEffect(() => {
    fetchCourses();
  }, []);

  // When selected course changes, fetch its videos or analytics
  useEffect(() => {
    if (selectedCourseId) {
      if (activeSubTab === "curriculum") {
        fetchCourseVideos(selectedCourseId);
      } else {
        fetchCourseAnalytics(selectedCourseId);
      }
    }
  }, [selectedCourseId, activeSubTab]);

  const fetchCourses = async () => {
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
  };

  const fetchCourseVideos = async (sessionId) => {
    setLoadingVideos(true);
    try {
      const res = await axiosClient.get(\`/api/trainer/tridin/courses/\${sessionId}/videos\`);
      setVideos(res.data?.videos || []);
    } catch (err) {
      console.error("Error loading course videos:", err);
    } finally {
      setLoadingVideos(false);
    }
  };

  const fetchCourseAnalytics = async (sessionId) => {
    setLoadingAnalytics(true);
    try {
      const res = await axiosClient.get(\`/api/trainer/tridin/courses/\${sessionId}/candidate-progress\`);
      setAnalytics(res.data || null);
    } catch (err) {
      console.error("Error loading candidate analytics:", err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // ── Open Add/Edit Video Modal ─────────────────────────────────────────────
  const openAddVideoModal = () => {
    setEditingVideo(null);
    setVideoForm({
      title: "",
      description: "",
      videoUrl: "",
      durationMinutes: 10,
      thumbnailFile: null,
      thumbnailPreview: "",
    });
    setVideoError("");
    setVideoModalOpen(true);
  };

  const openEditVideoModal = (video) => {
    setEditingVideo(video);
    setVideoForm({
      title: video.title || "",
      description: video.description || "",
      videoUrl: video.videoUrl || "",
      durationMinutes: Math.round((video.durationSeconds || 0) / 60) || 10,
      thumbnailFile: null,
      thumbnailPreview: video.thumbnailUrl || "",
    });
    setVideoError("");
    setVideoModalOpen(true);
  };

  const handleThumbnailFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoForm((prev) => ({
        ...prev,
        thumbnailFile: file,
        thumbnailPreview: URL.createObjectURL(file),
      }));
    }
  };

  const handleSaveVideo = async (e) => {
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
  };

  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm("Are you sure you want to delete this video and its assessment?")) return;
    try {
      await axiosClient.delete(\`/api/trainer/tridin/videos/\${videoId}\`);
      fetchCourseVideos(selectedCourseId);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to delete video.");
    }
  };

  // ── Open Manage Assessment Modal ──────────────────────────────────────────
  const openAssessmentModal = (video) => {
    setTargetVideo(video);
    setQuizError("");
    setQuizSuccess("");

    if (video.assessment) {
      setQuizForm({
        title: video.assessment.title || \`Assessment: \${video.title}\`,
        passingScore: video.assessment.passingScore || 70,
        timeLimitMinutes: video.assessment.timeLimitMinutes || 15,
        questions:
          video.assessment.questions && video.assessment.questions.length > 0
            ? video.assessment.questions.map((q) => ({
                questionText: q.questionText || "",
                options: Array.isArray(q.options) ? q.options : ["", "", "", ""],
                correctOption: q.correctOption ?? 0,
                explanation: q.explanation || "",
              }))
            : [
                {
                  questionText: "",
                  options: ["", "", "", ""],
                  correctOption: 0,
                  explanation: "",
                },
              ],
      });
    } else {
      setQuizForm({
        title: \`Assessment: \${video.title}\`,
        passingScore: 70,
        timeLimitMinutes: 15,
        questions: [
          {
            questionText: "",
            options: ["", "", "", ""],
            correctOption: 0,
            explanation: "",
          },
        ],
      });
    }

    setQuizModalOpen(true);
  };

  const handleAddQuestion = () => {
    setQuizForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          questionText: "",
          options: ["", "", "", ""],
          correctOption: 0,
          explanation: "",
        },
      ],
    }));
  };

  const handleRemoveQuestion = (idx) => {
    if (quizForm.questions.length <= 1) return;
    setQuizForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
  };

  const handleQuestionChange = (idx, field, value) => {
    setQuizForm((prev) => {
      const updated = [...prev.questions];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, questions: updated };
    });
  };

  const handleOptionChange = (qIdx, optIdx, value) => {
    setQuizForm((prev) => {
      const updated = [...prev.questions];
      const opts = [...updated[qIdx].options];
      opts[optIdx] = value;
      updated[qIdx] = { ...updated[qIdx], options: opts };
      return { ...prev, questions: updated };
    });
  };

  const handleSaveAssessment = async (e) => {
    e.preventDefault();
    setQuizError("");
    setQuizSuccess("");

    // Validate
    for (let i = 0; i < quizForm.questions.length; i++) {
      const q = quizForm.questions[i];
      if (!q.questionText.trim()) {
        setQuizError(\`Question #\${i + 1} cannot have an empty question text.\`);
        return;
      }
      for (let j = 0; j < q.options.length; j++) {
        if (!String(q.options[j]).trim()) {
          setQuizError(\`Question #\${i + 1}, Option \${j + 1} cannot be empty.\`);
          return;
        }
      }
    }

    setSavingQuiz(true);
    try {
      await axiosClient.post(\`/api/trainer/tridin/videos/\${targetVideo.id}/assessment\`, {
        title: quizForm.title,
        passingScore: Number(quizForm.passingScore) || 70,
        timeLimitMinutes: Number(quizForm.timeLimitMinutes) || 15,
        questions: quizForm.questions,
      });

      setQuizSuccess("Assessment saved successfully!");
      setTimeout(() => {
        setQuizModalOpen(false);
        fetchCourseVideos(selectedCourseId);
      }, 1000);
    } catch (err) {
      console.error("Save assessment error:", err);
      setQuizError(err.response?.data?.message || "Failed to save assessment.");
    } finally {
      setSavingQuiz(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50 min-h-full">
      {/* ── Top Header Banner ── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-[#004d3d] mb-1">
            <FiYoutube className="h-4 w-4 text-red-600" />
            <span>Tridin Candidates Learning Hub</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">
            1-by-1 Course Videos & Assessments
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Upload videos sequentially. Candidates must watch 100% of each video to unlock the assessment and pass to proceed!
          </p>
        </div>

        {selectedCourseId && (
          <button
            onClick={openAddVideoModal}
            className="inline-flex items-center gap-2 rounded-xl bg-[#004d3d] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#00392d] shadow-sm transition-all active:scale-95 whitespace-nowrap"
          >
            <FiPlus className="h-4 w-4" />
            <span>Add Next Video</span>
          </button>
        )}
      </div>

      {/* ── Course Selector Card ── */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex-1 max-w-md">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
              Select Tridin Course
            </label>
            {loadingCourses ? (
              <div className="h-10 bg-gray-100 animate-pulse rounded-lg" />
            ) : courses.length === 0 ? (
              <div className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                No Tridin courses found. Please create a course session with "isTridinOnly" enabled first.
              </div>
            ) : (
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-gray-800 focus:border-[#004d3d] focus:bg-white focus:outline-none"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || c.courseTitle} ({c._count?.tridinVideos || 0} Videos)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Sub tabs: Videos Playlist vs Candidate Analytics */}
          <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
            <button
              onClick={() => setActiveSubTab("curriculum")}
              className={\`rounded-lg px-4 py-1.5 text-xs font-extrabold transition-all \${
                activeSubTab === "curriculum"
                  ? "bg-white text-[#004d3d] shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }\`}
            >
              Curriculum ({videos.length})
            </button>
            <button
              onClick={() => setActiveSubTab("analytics")}
              className={\`rounded-lg px-4 py-1.5 text-xs font-extrabold transition-all \${
                activeSubTab === "analytics"
                  ? "bg-white text-[#004d3d] shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }\`}
            >
              Candidate Progress
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Tab 1: Video Playlist (YouTube 1-by-1 style) ── */}
      {activeSubTab === "curriculum" ? (
        <div>
          {loadingVideos ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-white rounded-2xl border border-gray-200 animate-pulse" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-12 text-center">
              <FiPlay className="mx-auto h-12 w-12 text-gray-300 mb-3" />
              <h3 className="text-base font-bold text-gray-800 mb-1">No Videos in Playlist</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
                Start by adding Video #1. You can paste a YouTube link or direct video link and upload custom thumbnails.
              </p>
              <button
                onClick={openAddVideoModal}
                className="inline-flex items-center gap-2 rounded-xl bg-[#004d3d] px-4 py-2 text-xs font-bold text-white hover:bg-[#00392d]"
              >
                <FiPlus className="h-4 w-4" /> Add Video #1
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {videos.map((video, idx) => {
                const hasQuiz = Boolean(video.assessment && video.assessment.questions?.length > 0);
                const durationMin = Math.round((video.durationSeconds || 0) / 60);

                return (
                  <div
                    key={video.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm hover:border-emerald-300 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      {/* Order Index Badge */}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 font-black text-sm text-gray-700">
                        #{video.orderIndex || idx + 1}
                      </div>

                      {/* Video Thumbnail */}
                      <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-xl bg-gray-900 border border-gray-200">
                        {video.thumbnailUrl ? (
                          <img
                            src={video.thumbnailUrl}
                            alt={video.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gray-800 text-gray-400">
                            <FiVideo className="h-6 w-6" />
                          </div>
                        )}
                        <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {durationMin} min
                        </div>
                      </div>

                      {/* Video Info */}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 inline-flex items-center gap-1">
                            <FiYoutube className="h-3 w-3" /> YouTube
                          </span>
                          <span className="text-xs font-bold text-gray-400">
                            Video #{video.orderIndex || idx + 1}
                          </span>
                        </div>

                        <h3 className="font-extrabold text-sm text-gray-900 mt-1 line-clamp-1">
                          {video.title}
                        </h3>
                        {video.description && (
                          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                            {video.description}
                          </p>
                        )}

                        {/* Assessment Status Pill */}
                        <div className="mt-2 flex items-center gap-2">
                          {hasQuiz ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                              <FiCheckCircle className="h-3.5 w-3.5" />
                              Assessment: {video.assessment.questions.length} Questions (Pass: {video.assessment.passingScore}%)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
                              <FiAlertCircle className="h-3.5 w-3.5" />
                              No Assessment Configured
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => openAssessmentModal(video)}
                        className={\`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all \${
                          hasQuiz
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                            : "bg-[#004d3d] text-white hover:bg-[#00392d]"
                        }\`}
                      >
                        <FiHelpCircle className="h-4 w-4" />
                        <span>{hasQuiz ? "Edit Quiz" : "Add Assessment"}</span>
                      </button>

                      <button
                        onClick={() => openEditVideoModal(video)}
                        className="rounded-xl border border-gray-200 bg-gray-50 p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        title="Edit Video"
                      >
                        <FiEdit className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteVideo(video.id)}
                        className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-100"
                        title="Delete Video"
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── Main Tab 2: Candidate Progress Analytics ── */
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-4">
            Candidate Gatekeeping & Progress Report
          </h2>

          {loadingAnalytics ? (
            <div className="py-8 text-center text-xs text-gray-500 animate-pulse">
              Loading progress records...
            </div>
          ) : !analytics || analytics.records?.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-500">
              No candidates have started watching this playlist yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 font-bold text-gray-500 uppercase tracking-wider">
                    <th className="p-3">Candidate</th>
                    <th className="p-3">Video Module</th>
                    <th className="p-3">Watched</th>
                    <th className="p-3">Assessment Status</th>
                    <th className="p-3">Attempts</th>
                    <th className="p-3">Last Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {analytics.records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50">
                      <td className="p-3 font-semibold text-gray-900">
                        {rec.user?.fullName}
                        <span className="block text-[10px] text-gray-500 font-normal">
                          {rec.user?.email}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-gray-800">
                        #{rec.video?.orderIndex} - {rec.video?.title}
                      </td>
                      <td className="p-3">
                        {rec.watchCompleted ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                            <FiCheckCircle className="h-3.5 w-3.5" /> 100% Watched
                          </span>
                        ) : (
                          <span className="text-gray-500">{rec.watchedSeconds} sec</span>
                        )}
                      </td>
                      <td className="p-3">
                        {rec.isPassed ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                            PASSED
                          </span>
                        ) : rec.totalAttempts > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-700">
                            FAILED (Re-watch Required)
                          </span>
                        ) : rec.canAttemptAssessment ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                            Ready For Test
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                            Watching
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-gray-700">{rec.totalAttempts}</td>
                      <td className="p-3 font-bold text-gray-800">
                        {rec.lastScorePercentage !== null ? \`\${rec.lastScorePercentage}%\` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: ADD / EDIT VIDEO (WITH THUMBNAIL UPLOAD AS REQUESTED)            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {videoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-base font-black text-gray-900">
                {editingVideo ? "Edit Video" : "Add Video to Playlist"}
              </h3>
              <button
                onClick={() => setVideoModalOpen(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVideo} className="mt-4 space-y-4">
              {videoError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600">
                  {videoError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Video Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Python Tutorial #1 - Variables and Inputs"
                  value={videoForm.title}
                  onChange={(e) => setVideoForm({ ...videoForm, title: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-[#004d3d] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  YouTube or Video URL *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. https://www.youtube.com/watch?v=YtX-Rmoea0M"
                  value={videoForm.videoUrl}
                  onChange={(e) => setVideoForm({ ...videoForm, videoUrl: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-[#004d3d] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Paste standard YouTube link (watch?v=..., youtu.be/...) or direct video URL.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  value={videoForm.durationMinutes}
                  onChange={(e) => setVideoForm({ ...videoForm, durationMinutes: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-[#004d3d] focus:outline-none"
                />
              </div>

              {/* THUMBNAIL UPLOAD (FILE UPLOAD AS SPECIFIED) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Custom Thumbnail (Image Upload)
                </label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 transition-all">
                    <FiUpload className="h-4 w-4 text-gray-500" />
                    <span>Choose Image File</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleThumbnailFileChange}
                    />
                  </label>
                  <span className="text-[11px] text-gray-400">
                    {videoForm.thumbnailFile ? videoForm.thumbnailFile.name : "Optional (Defaults to YouTube thumbnail)"}
                  </span>
                </div>

                {videoForm.thumbnailPreview && (
                  <div className="mt-2 h-24 w-40 overflow-hidden rounded-xl border border-gray-200">
                    <img
                      src={videoForm.thumbnailPreview}
                      alt="Thumbnail Preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Description / Study Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  placeholder="Important key points or topics covered in this video..."
                  value={videoForm.description}
                  onChange={(e) => setVideoForm({ ...videoForm, description: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-[#004d3d] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setVideoModalOpen(false)}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingVideo}
                  className="rounded-xl bg-[#004d3d] px-5 py-2 text-xs font-bold text-white hover:bg-[#00392d] disabled:opacity-50"
                >
                  {savingVideo ? "Saving..." : editingVideo ? "Update Video" : "Add Video"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL: MANAGE ASSESSMENT QUESTIONS                                     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {quizModalOpen && targetVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-black text-gray-900">
                  Manage Assessment Questions
                </h3>
                <p className="text-xs text-gray-500">
                  Video #{targetVideo.orderIndex}: {targetVideo.title}
                </p>
              </div>
              <button
                onClick={() => setQuizModalOpen(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAssessment} className="flex-1 overflow-y-auto pr-2 mt-4 space-y-4">
              {quizError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600">
                  {quizError}
                </div>
              )}
              {quizSuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                  {quizSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Passing Score Percentage (%)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={quizForm.passingScore}
                    onChange={(e) => setQuizForm({ ...quizForm, passingScore: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-[#004d3d] focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] text-gray-400">
                    Candidate must achieve this score to unlock the next video.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Time Limit (Minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quizForm.timeLimitMinutes}
                    onChange={(e) => setQuizForm({ ...quizForm, timeLimitMinutes: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-[#004d3d] focus:outline-none"
                  />
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-500">
                    Questions ({quizForm.questions.length})
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                  >
                    <FiPlus className="h-3.5 w-3.5" /> Add Question
                  </button>
                </div>

                {quizForm.questions.map((q, qIdx) => (
                  <div
                    key={qIdx}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-3 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-gray-700">
                        Question #{qIdx + 1}
                      </span>
                      {quizForm.questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(qIdx)}
                          className="text-red-500 hover:text-red-700 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <FiTrash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      required
                      placeholder={\`Enter question #\${qIdx + 1}...\`}
                      value={q.questionText}
                      onChange={(e) => handleQuestionChange(qIdx, "questionText", e.target.value)}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 font-medium focus:border-[#004d3d] focus:outline-none"
                    />

                    {/* Options (A, B, C, D) with Correct Option selection */}
                    <div className="space-y-2 pt-1">
                      <span className="block text-[11px] font-bold text-gray-500">
                        Options & Select Correct Answer:
                      </span>
                      {q.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={\`correctOption_\${qIdx}\`}
                            checked={q.correctOption === optIdx}
                            onChange={() => handleQuestionChange(qIdx, "correctOption", optIdx)}
                            className="h-4 w-4 text-[#004d3d] focus:ring-[#004d3d]"
                            title="Mark as correct answer"
                          />
                          <span className="text-xs font-bold text-gray-500 w-4">
                            {String.fromCharCode(65 + optIdx)}.
                          </span>
                          <input
                            type="text"
                            required
                            placeholder={\`Option \${String.fromCharCode(65 + optIdx)}\`}
                            value={opt}
                            onChange={(e) => handleOptionChange(qIdx, optIdx, e.target.value)}
                            className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-[#004d3d] focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>

                    <div>
                      <input
                        type="text"
                        placeholder="Explanation / Why this answer is correct (Optional)"
                        value={q.explanation}
                        onChange={(e) => handleQuestionChange(qIdx, "explanation", e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 focus:border-[#004d3d] focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setQuizModalOpen(false)}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingQuiz}
                  className="rounded-xl bg-[#004d3d] px-5 py-2 text-xs font-bold text-white hover:bg-[#00392d] disabled:opacity-50"
                >
                  {savingQuiz ? "Saving..." : "Save Assessment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync(targetFile, content, "utf8");
console.log("Successfully wrote TridinCurriculumSection.jsx");
