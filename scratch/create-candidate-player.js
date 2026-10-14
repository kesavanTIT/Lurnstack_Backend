const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\pages\\TridinCoursePlayerPage.jsx";

const content = `import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  FiAlertCircle,
  FiArrowLeft,
  FiAward,
  FiCheckCircle,
  FiClock,
  FiHelpCircle,
  FiLock,
  FiPlay,
  FiRefreshCw,
  FiShield,
  FiX,
  FiYoutube,
} from "react-icons/fi";
import { axiosClient } from "../shared/api/axiosClient";
import { PATHS } from "../app/router/paths";
import { useAuth } from "../auth";

export default function TridinCoursePlayerPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [session, setSession] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Active Video State
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [watchedSeconds, setWatchedSeconds] = useState(0);
  const [watchCompleted, setWatchCompleted] = useState(false);
  const [canAttemptAssessment, setCanAttemptAssessment] = useState(false);
  const [isPassed, setIsPassed] = useState(false);
  const [lastScore, setLastScore] = useState(null);

  // Assessment Modal State
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [quizData, setQuizData] = useState(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [quizResult, setQuizResult] = useState(null);
  const [quizTimeRemaining, setQuizTimeRemaining] = useState(0);

  // Heartbeat interval ref
  const heartbeatRef = useRef(null);
  const timerRef = useRef(null);

  // Load Playlist on mount
  useEffect(() => {
    fetchPlaylist();
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionId]);

  const fetchPlaylist = async (preserveIndex = null) => {
    try {
      setLoading(true);
      setError("");
      const res = await axiosClient.get(\`/api/tridin/courses/\${sessionId}/playlist\`);
      const { session: sess, playlist: list } = res.data;
      setSession(sess);
      setPlaylist(list || []);

      if (list && list.length > 0) {
        const nextIdx =
          preserveIndex !== null
            ? preserveIndex
            : list.findIndex((v) => !v.progress.isPassed);
        const resolvedIdx = nextIdx !== -1 ? nextIdx : 0;
        selectVideo(resolvedIdx, list);
      }
    } catch (err) {
      console.error("fetchPlaylist error:", err);
      setError(err.response?.data?.message || "Failed to load course curriculum.");
    } finally {
      setLoading(false);
    }
  };

  const selectVideo = (idx, list = playlist) => {
    const video = list[idx];
    if (!video) return;

    if (!video.isUnlocked) {
      alert("This video is locked! Please complete and pass the previous assessment first.");
      return;
    }

    setActiveVideoIndex(idx);
    setWatchedSeconds(video.progress.watchedSeconds || 0);
    setWatchCompleted(video.progress.watchCompleted || false);
    setCanAttemptAssessment(video.progress.canAttemptAssessment || false);
    setIsPassed(video.progress.isPassed || false);
    setLastScore(video.progress.lastScore);

    // Reset quiz modal state
    setQuizResult(null);
    setSelectedAnswers({});
    setCurrentQuestionIndex(0);
  };

  const activeVideo = playlist[activeVideoIndex] || null;

  // ── Auto Watch Heartbeat for YouTube / Video Player ──────────────────────
  useEffect(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);

    if (activeVideo && activeVideo.isUnlocked && !watchCompleted) {
      heartbeatRef.current = setInterval(() => {
        setWatchedSeconds((prev) => {
          const nextSec = prev + 5;
          const duration = activeVideo.durationSeconds || 300;

          // When reached duration threshold (90%), trigger completion
          if (nextSec >= duration * 0.9 && !watchCompleted) {
            sendCompletion(nextSec);
          } else if (nextSec % 15 === 0) {
            sendHeartbeat(nextSec, false);
          }
          return nextSec;
        });
      }, 5000);
    }

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [activeVideo, watchCompleted]);

  const sendHeartbeat = async (seconds, completed) => {
    if (!activeVideo) return;
    try {
      await axiosClient.post(\`/api/tridin/videos/\${activeVideo.id}/progress\`, {
        watchedSeconds: seconds,
        isCompleted: completed,
      });
    } catch (err) {
      console.warn("Heartbeat update failed:", err.message);
    }
  };

  const sendCompletion = async (seconds) => {
    if (!activeVideo) return;
    try {
      const res = await axiosClient.post(\`/api/tridin/videos/\${activeVideo.id}/progress\`, {
        watchedSeconds: seconds,
        isCompleted: true,
      });
      if (res.data?.success) {
        setWatchCompleted(true);
        setCanAttemptAssessment(true);
        // Refresh playlist progress without jumping video
        fetchPlaylist(activeVideoIndex);
      }
    } catch (err) {
      console.error("sendCompletion error:", err);
    }
  };

  // ── Assessment Flow ────────────────────────────────────────────────────────
  const openAssessment = async () => {
    if (!activeVideo) return;
    setQuizLoading(true);
    setQuizResult(null);
    setSelectedAnswers({});
    setCurrentQuestionIndex(0);

    try {
      const res = await axiosClient.get(\`/api/tridin/videos/\${activeVideo.id}/assessment\`);
      const assessment = res.data?.assessment;
      setQuizData(assessment);
      setQuizTimeRemaining((assessment.timeLimitMinutes || 15) * 60);
      setQuizModalOpen(true);
    } catch (err) {
      alert(err.response?.data?.message || "Failed to load assessment.");
    } finally {
      setQuizLoading(false);
    }
  };

  // Quiz Timer Countdown
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (quizModalOpen && quizData && !quizResult && quizTimeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setQuizTimeRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            handleSubmitQuiz();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [quizModalOpen, quizData, quizResult]);

  const handleSelectAnswer = (qId, optionIndex) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [qId]: optionIndex,
    }));
  };

  const handleSubmitQuiz = async () => {
    if (!activeVideo) return;
    setSubmittingQuiz(true);

    try {
      const res = await axiosClient.post(
        \`/api/tridin/videos/\${activeVideo.id}/assessment/submit\`,
        { answers: selectedAnswers }
      );

      const result = res.data;
      setQuizResult(result);

      if (result.isPassed) {
        setIsPassed(true);
        // Refresh playlist to unlock the next video!
        fetchPlaylist(activeVideoIndex);
      } else {
        // Candidate FAILED:
        // Gatekeeping rule: watch status reset, assessment locked again!
        setWatchCompleted(false);
        setCanAttemptAssessment(false);
        setWatchedSeconds(0);
        setIsPassed(false);
        fetchPlaylist(activeVideoIndex);
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to submit assessment.");
    } finally {
      setSubmittingQuiz(false);
    }
  };

  const handleProceedToNextVideo = () => {
    setQuizModalOpen(false);
    const nextIdx = activeVideoIndex + 1;
    if (nextIdx < playlist.length) {
      selectVideo(nextIdx);
    }
  };

  const handleRewatchVideo = () => {
    setQuizModalOpen(false);
    setWatchedSeconds(0);
    setWatchCompleted(false);
    setCanAttemptAssessment(false);
    // Restart video
    const iframe = document.getElementById("tridin-youtube-player");
    if (iframe) {
      iframe.src = iframe.src; // reload iframe from start
    }
  };

  // Helper formatting seconds to MM:SS
  const formatTime = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return \`\${String(mins).padStart(2, "0")}:\${String(secs).padStart(2, "0")}\`;
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white font-sans">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-gray-400">Loading Tridin Course Player...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 p-4 font-sans">
        <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-lg border border-gray-200">
          <FiAlertCircle className="mx-auto h-12 w-12 text-red-500 mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Error Loading Course</h2>
          <p className="text-xs text-gray-500 mb-6">{error || "Course session not found."}</p>
          <button
            onClick={() => navigate(PATHS.TRIDIN_DASHBOARD)}
            className="rounded-xl bg-[#004d3d] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#00392d]"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const durationSec = activeVideo?.durationSeconds || 300;
  const watchPct = Math.min(100, Math.round((watchedSeconds / durationSec) * 100));
  const passedVideosCount = playlist.filter((v) => v.progress?.isPassed).length;

  return (
    <div className="min-h-screen bg-[#0f172a] text-gray-100 font-sans flex flex-col">
      {/* ── Top Navigation Bar ── */}
      <header className="sticky top-0 z-40 border-b border-gray-800 bg-[#1e293b]/95 backdrop-blur-md px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(PATHS.TRIDIN_DASHBOARD)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800/80 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-700 hover:text-white transition-all"
            >
              <FiArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
            <div className="h-4 w-[1px] bg-gray-700" />
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                {session.category || "Tridin Training Track"}
              </span>
              <h1 className="text-sm font-extrabold text-white truncate max-w-xs sm:max-w-md">
                {session.title || session.courseTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Progress Badge */}
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3.5 py-1 text-xs font-bold text-emerald-300">
              <FiAward className="h-4 w-4 text-emerald-400" />
              <span>
                {passedVideosCount} / {playlist.length} Completed
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs font-semibold text-gray-200">
              <div className="h-5 w-5 rounded-full bg-[#004d3d] text-white flex items-center justify-center text-[10px] font-black">
                {user?.fullName ? user.fullName[0].toUpperCase() : "T"}
              </div>
              <span className="hidden sm:inline">{user?.fullName || "Candidate"}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main YouTube Layout Grid (Player on Left, Playlist on Right) ── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Left Column: Video Player & Assessment Card (70%) ── */}
        <section className="lg:col-span-8 space-y-4">
          {/* Video Player Container */}
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-black border border-gray-800 shadow-2xl">
            {activeVideo && activeVideo.isUnlocked ? (
              activeVideo.youtubeId ? (
                <iframe
                  id="tridin-youtube-player"
                  src={\`https://www.youtube.com/embed/\${activeVideo.youtubeId}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1\`}
                  title={activeVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="h-full w-full border-0"
                />
              ) : activeVideo.videoUrl ? (
                <video
                  src={activeVideo.videoUrl}
                  controls
                  controlsList="nodownload"
                  autoPlay
                  className="h-full w-full object-contain"
                  onEnded={() => sendCompletion(activeVideo.durationSeconds)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-500 text-sm">
                  No video source available.
                </div>
              )
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center bg-gray-950 p-6 text-center text-gray-400">
                <FiLock className="h-12 w-12 text-gray-600 mb-2" />
                <p className="text-sm font-bold text-gray-300">This Video is Locked</p>
                <p className="text-xs text-gray-500 mt-1 max-w-xs">
                  You must pass the assessment for the previous video to unlock this module.
                </p>
              </div>
            )}
          </div>

          {/* Video Title & Live Watch Progress Bar */}
          <div className="rounded-2xl border border-gray-800 bg-[#1e293b] p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-400">
                  <FiYoutube className="h-4 w-4 text-red-500" />
                  Video #{activeVideo?.orderIndex || activeVideoIndex + 1}
                </span>
                <h2 className="text-lg font-black text-white mt-0.5">
                  {activeVideo?.title || "Course Video"}
                </h2>
              </div>

              {/* Watch time counter */}
              <div className="flex items-center gap-2 self-start sm:self-center bg-gray-900/80 px-3 py-1.5 rounded-xl border border-gray-800 text-xs">
                <FiClock className="h-3.5 w-3.5 text-gray-400" />
                <span className="font-bold text-gray-200">
                  {formatTime(watchedSeconds)} / {formatTime(durationSec)}
                </span>
                <span className="text-emerald-400 font-black">({watchPct}%)</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                style={{ width: \`\${watchPct}%\` }}
              />
            </div>

            {/* ── CORE LMS GATEKEEPING ACTION CARD ── */}
            <div className="pt-2">
              {isPassed ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white font-black">
                      <FiCheckCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-emerald-200">
                        Module Completed!
                      </h4>
                      <p className="text-xs text-emerald-400">
                        You passed with {lastScore !== null ? \`\${lastScore}%\` : "flying colors"}! Next video in the playlist is unlocked.
                      </p>
                    </div>
                  </div>

                  {activeVideoIndex + 1 < playlist.length && (
                    <button
                      onClick={() => selectVideo(activeVideoIndex + 1)}
                      className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600 transition-all active:scale-95 whitespace-nowrap shadow-md shadow-emerald-900/40"
                    >
                      Next Video ➔
                    </button>
                  )}
                </div>
              ) : canAttemptAssessment || watchCompleted ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-500 bg-gradient-to-r from-emerald-950/80 to-[#004d3d]/80 p-4 shadow-lg shadow-emerald-950/50 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-black font-black animate-bounce">
                      <FiAward className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-sm text-white">
                        Video 100% Watched! Assessment Unlocked
                      </h4>
                      <p className="text-xs text-emerald-200">
                        Take the test to unlock the next video in your training track.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={openAssessment}
                    disabled={quizLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-xs font-black text-black hover:bg-emerald-300 transition-all active:scale-95 whitespace-nowrap shadow-lg"
                  >
                    <FiHelpCircle className="h-4 w-4" />
                    <span>{quizLoading ? "Loading..." : "Take Assessment"}</span>
                  </button>
                </div>
              ) : activeVideo?.progress?.totalAttempts > 0 && !watchCompleted ? (
                /* FAILED: RE-WATCH REQUIRED CARD */
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-red-500/50 bg-red-950/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white font-black">
                      <FiAlertCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-red-200">
                        Assessment Re-Watch Required
                      </h4>
                      <p className="text-xs text-red-300">
                        You didn't reach the required score. Please re-watch this video completely to re-attempt the quiz.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleRewatchVideo}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-400 bg-red-900/50 px-4 py-2 text-xs font-bold text-white hover:bg-red-800 whitespace-nowrap"
                  >
                    <FiRefreshCw className="h-3.5 w-3.5" /> Re-watch Now
                  </button>
                </div>
              ) : (
                /* IN PROGRESS: WATCH FULL VIDEO CARD */
                <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                  <FiLock className="h-5 w-5 text-gray-500 shrink-0" />
                  <p className="text-xs text-gray-400 leading-relaxed">
                    <strong className="text-gray-200">Assessment Locked:</strong> You must watch 100% of this video without skipping. The assessment test will unlock automatically when the video completes.
                  </p>
                </div>
              )}
            </div>

            {/* Video Description */}
            {activeVideo?.description && (
              <div className="pt-2 border-t border-gray-800 text-xs text-gray-400 leading-relaxed">
                <span className="font-bold text-gray-300 block mb-0.5">Lesson Notes:</span>
                {activeVideo.description}
              </div>
            )}
          </div>
        </section>

        {/* ── Right Column: YouTube-Style Course Playlist (30%) ── */}
        <aside className="lg:col-span-4 space-y-3">
          <div className="rounded-2xl border border-gray-800 bg-[#1e293b] p-4 shadow-sm flex flex-col h-full max-h-[85vh]">
            <div className="pb-3 border-b border-gray-800">
              <h3 className="text-sm font-black text-white">Course Curriculum</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {playlist.length} Lessons • Sequential 1-by-1 Progression
              </p>
            </div>

            {/* Playlist Scrollable Items */}
            <div className="flex-1 overflow-y-auto mt-3 space-y-2 pr-1">
              {playlist.map((item, idx) => {
                const isCurrent = idx === activeVideoIndex;
                const isItemPassed = item.progress?.isPassed;
                const isLocked = !item.isUnlocked;
                const itemDurationMin = Math.round((item.durationSeconds || 0) / 60);

                return (
                  <button
                    key={item.id}
                    onClick={() => selectVideo(idx)}
                    disabled={isLocked}
                    className={\`w-full text-left rounded-xl p-2.5 transition-all flex items-start gap-3 \${
                      isCurrent
                        ? "bg-[#004d3d] text-white ring-2 ring-emerald-400"
                        : isLocked
                        ? "bg-gray-900/40 text-gray-500 opacity-60 cursor-not-allowed"
                        : "bg-gray-900/80 text-gray-300 hover:bg-gray-800"
                    }\`}
                  >
                    {/* Thumbnail Preview */}
                    <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-black border border-gray-800">
                      {item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-600">
                          <FiPlay className="h-5 w-5" />
                        </div>
                      )}
                      {/* Locked Overlay */}
                      {isLocked && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                          <FiLock className="h-4 w-4 text-gray-400" />
                        </div>
                      )}
                      <div className="absolute bottom-1 right-1 rounded bg-black/90 px-1 text-[8px] font-bold text-white">
                        {itemDurationMin}m
                      </div>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold text-gray-400">
                          #{item.orderIndex || idx + 1}
                        </span>
                        {isItemPassed ? (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded">
                            <FiCheckCircle className="h-3 w-3" /> PASSED
                          </span>
                        ) : isCurrent ? (
                          <span className="text-[9px] font-black text-emerald-300 animate-pulse">
                            NOW PLAYING
                          </span>
                        ) : isLocked ? (
                          <span className="text-[9px] font-bold text-gray-500">LOCKED</span>
                        ) : (
                          <span className="text-[9px] font-bold text-gray-400">READY</span>
                        )}
                      </div>

                      <h4 className="text-xs font-bold leading-snug line-clamp-2 mt-0.5">
                        {item.title}
                      </h4>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </main>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* INTERACTIVE ASSESSMENT MODAL                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {quizModalOpen && quizData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-[#1e293b] border border-gray-700 p-6 shadow-2xl text-white my-8">
            {!quizResult ? (
              /* Quiz Taking Screen */
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-gray-800">
                  <div>
                    <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">
                      Assessment Test
                    </span>
                    <h3 className="text-base font-black text-white">
                      {quizData.title}
                    </h3>
                  </div>

                  {/* Timer Badge */}
                  <div className="flex items-center gap-1.5 rounded-full bg-red-950/60 border border-red-500/40 px-3 py-1 text-xs font-black text-red-300">
                    <FiClock className="h-3.5 w-3.5 text-red-400 animate-pulse" />
                    <span>{formatTime(quizTimeRemaining)}</span>
                  </div>
                </div>

                {/* Progress Indicators */}
                <div className="py-3 flex items-center justify-between text-xs text-gray-400">
                  <span>
                    Question {currentQuestionIndex + 1} of {quizData.questions.length}
                  </span>
                  <span>Pass mark: {quizData.passingScore}%</span>
                </div>

                {/* Active Question Box */}
                {quizData.questions[currentQuestionIndex] && (
                  <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4 space-y-4">
                    <p className="text-sm font-bold text-gray-100 leading-relaxed">
                      {quizData.questions[currentQuestionIndex].questionText}
                    </p>

                    <div className="space-y-2">
                      {quizData.questions[currentQuestionIndex].options.map((opt, optIdx) => {
                        const qId = quizData.questions[currentQuestionIndex].id;
                        const isSelected = selectedAnswers[qId] === optIdx;

                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() => handleSelectAnswer(qId, optIdx)}
                            className={\`w-full text-left rounded-xl p-3 text-xs font-semibold transition-all flex items-center gap-3 border \${
                              isSelected
                                ? "bg-emerald-950/80 border-emerald-400 text-white"
                                : "bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-800"
                            }\`}
                          >
                            <span
                              className={\`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black \${
                                isSelected
                                  ? "bg-emerald-400 text-black"
                                  : "bg-gray-700 text-gray-300"
                              }\`}
                            >
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            <span className="flex-1">{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Question Navigation Controls */}
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-800">
                  <button
                    type="button"
                    disabled={currentQuestionIndex === 0}
                    onClick={() => setCurrentQuestionIndex((prev) => prev - 1)}
                    className="rounded-xl border border-gray-700 px-4 py-2 text-xs font-bold text-gray-300 hover:bg-gray-800 disabled:opacity-40"
                  >
                    Previous
                  </button>

                  {currentQuestionIndex + 1 < quizData.questions.length ? (
                    <button
                      type="button"
                      onClick={() => setCurrentQuestionIndex((prev) => prev + 1)}
                      className="rounded-xl bg-gray-700 px-4 py-2 text-xs font-bold text-white hover:bg-gray-600"
                    >
                      Next Question
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submittingQuiz}
                      onClick={handleSubmitQuiz}
                      className="rounded-xl bg-emerald-500 px-5 py-2 text-xs font-black text-black hover:bg-emerald-400 disabled:opacity-50 shadow-lg shadow-emerald-900/50"
                    >
                      {submittingQuiz ? "Evaluating..." : "Submit Test"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Quiz Result Screen */
              <div className="text-center py-4 space-y-4">
                {quizResult.isPassed ? (
                  <div className="space-y-3">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500">
                      <FiCheckCircle className="h-8 w-8" />
                    </div>
                    <h3 className="text-xl font-black text-emerald-300">
                      Congratulations! You Passed!
                    </h3>
                    <p className="text-3xl font-black text-white">
                      {quizResult.percentage}%
                    </p>
                    <p className="text-xs text-gray-300 max-w-sm mx-auto">
                      You scored {quizResult.score} out of {quizResult.totalQuestions}. Video #{activeVideoIndex + 2} is now unlocked in your playlist!
                    </p>
                    <button
                      onClick={handleProceedToNextVideo}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-2.5 text-xs font-black text-black hover:bg-emerald-300 shadow-lg active:scale-95 transition-all"
                    >
                      <span>Proceed to Next Video</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400 border border-red-500">
                      <FiAlertCircle className="h-8 w-8" />
                    </div>
                    <h3 className="text-xl font-black text-red-300">
                      Assessment Not Passed
                    </h3>
                    <p className="text-3xl font-black text-white">
                      {quizResult.percentage}%
                    </p>
                    <p className="text-xs text-red-200 bg-red-950/60 p-3 rounded-xl border border-red-500/40 max-w-sm mx-auto leading-relaxed">
                      Minimum required score is {quizResult.passingScore}%. In accordance with training policy, you must re-watch the video completely before you can retry this assessment.
                    </p>
                    <button
                      onClick={handleRewatchVideo}
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-xs font-bold text-white hover:bg-red-500 active:scale-95 transition-all"
                    >
                      <FiRefreshCw className="h-4 w-4" />
                      <span>Re-watch Video Now</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync(targetFile, content, "utf8");
console.log("Successfully created TridinCoursePlayerPage.jsx");
