const prisma = require("../config/db");
const { getRelativeUploadPath } = require("../utils/pathUtils");

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Parse YouTube URL or ID into clean 11-char ID
// ─────────────────────────────────────────────────────────────────────────────
function parseYouTubeId(input) {
  if (!input || typeof input !== "string") return null;
  const str = input.trim();

  // Already an 11-char YouTube ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }

  // Standard watch?v=ID or &v=ID
  const watchMatch = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch && watchMatch[1]) return watchMatch[1];

  // youtu.be/ID
  const shortMatch = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch && shortMatch[1]) return shortMatch[1];

  // youtube.com/embed/ID
  const embedMatch = str.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch && embedMatch[1]) return embedMatch[1];

  // youtube.com/shorts/ID
  const shortsMatch = str.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch && shortsMatch[1]) return shortsMatch[1];

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANDIDATE ENDPOINTS (Protected by tridinOnly)
// ─────────────────────────────────────────────────────────────────────────────

// @desc    Get YouTube-style 1-by-1 Course Playlist with candidate lock states
// @route   GET /api/tridin/courses/:sessionId/playlist
// @access  Private (TRIDIN_CANDIDATE only)
const getCandidateCoursePlaylist = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    // Verify session exists and is Tridin-only
    const session = await prisma.liveSession.findFirst({
      where: {
        id: sessionId,
        isTridinOnly: true,
      },
      select: {
        id: true,
        title: true,
        subtitle: true,
        description: true,
        courseTitle: true,
        category: true,
        thumbnail: true,
        trainer: {
          select: {
            id: true,
            fullName: true,
            profilePhotoUrl: true,
          },
        },
      },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Tridin course not found.",
      });
    }

    // Fetch all playlist videos ordered by orderIndex
    const videos = await prisma.tridinVideo.findMany({
      where: { sessionId },
      orderBy: { orderIndex: "asc" },
      include: {
        assessment: {
          select: {
            id: true,
            title: true,
            passingScore: true,
            timeLimitMinutes: true,
            _count: {
              select: { questions: true },
            },
          },
        },
        candidateProgress: {
          where: { userId },
          select: {
            watchedSeconds: true,
            watchCompleted: true,
            canAttemptAssessment: true,
            isPassed: true,
            lastScorePercentage: true,
            totalAttempts: true,
          },
        },
      },
    });

    // Compute Sequential 1-by-1 Lock/Unlock Gatekeeping
    let previousPassed = true; // Video #1 is always unlocked by default

    const playlist = videos.map((video, idx) => {
      const progress = video.candidateProgress[0] || null;
      const isPassed = progress?.isPassed || false;
      const watchCompleted = progress?.watchCompleted || false;
      const watchedSeconds = progress?.watchedSeconds || 0;
      const totalAttempts = progress?.totalAttempts || 0;
      const lastScore = progress?.lastScorePercentage ?? null;

      // Video is unlocked if previous video was passed (Video 0 always unlocked)
      const isVideoUnlocked = previousPassed;

      // Assessment is available ONLY if:
      // 1. Video itself is unlocked
      // 2. Video has been watched 100% (or progress.canAttemptAssessment === true)
      // 3. Has assessment questions configured
      const hasAssessment = Boolean(video.assessment && video.assessment._count.questions > 0);
      const canAttemptAssessment = isVideoUnlocked && hasAssessment && (progress?.canAttemptAssessment || false);

      // Determine clean status badge for UI
      let statusBadge = "LOCKED";
      if (isPassed) {
        statusBadge = "PASSED";
      } else if (totalAttempts > 0 && !watchCompleted) {
        statusBadge = "REWATCH_REQUIRED"; // Failed quiz, must re-watch
      } else if (canAttemptAssessment) {
        statusBadge = "ASSESSMENT_READY";
      } else if (isVideoUnlocked) {
        statusBadge = watchCompleted ? "READY_FOR_ASSESSMENT" : "UNWATCHED";
      }

      // Next video can unlock ONLY if this video was passed
      previousPassed = isPassed;

      return {
        id: video.id,
        orderIndex: video.orderIndex,
        title: video.title,
        description: video.description,
        videoType: video.videoType,
        videoUrl: isVideoUnlocked ? video.videoUrl : null,
        youtubeId: isVideoUnlocked ? video.youtubeId : null,
        durationSeconds: video.durationSeconds,
        thumbnailUrl:
          video.thumbnailUrl ||
          (video.youtubeId ? `https://img.youtube.com/vi/${video.youtubeId}/hqdefault.jpg` : session.thumbnail),
        isUnlocked: isVideoUnlocked,
        statusBadge,
        progress: {
          watchedSeconds,
          watchCompleted,
          canAttemptAssessment,
          isPassed,
          lastScore,
          totalAttempts,
        },
        assessment: video.assessment
          ? {
              id: video.assessment.id,
              title: video.assessment.title,
              passingScore: video.assessment.passingScore,
              timeLimitMinutes: video.assessment.timeLimitMinutes,
              questionCount: video.assessment._count.questions,
            }
          : null,
      };
    });

    return res.status(200).json({
      success: true,
      session,
      playlist,
      totalVideos: playlist.length,
      passedCount: playlist.filter((p) => p.progress.isPassed).length,
    });
  } catch (error) {
    console.error("getCandidateCoursePlaylist error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch course playlist.",
      error: error.message,
    });
  }
};

// @desc    Update candidate video watch progress (Heartbeat & Completion)
// @route   POST /api/tridin/videos/:videoId/progress
// @access  Private (TRIDIN_CANDIDATE only)
const recordVideoProgress = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.user.id;
    const { watchedSeconds = 0, isCompleted = false } = req.body;

    const video = await prisma.tridinVideo.findUnique({
      where: { id: videoId },
      include: {
        assessment: true,
      },
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video module not found.",
      });
    }

    // Check if watch threshold reached (90% of duration or explicitly completed)
    const threshold = video.durationSeconds > 0 ? video.durationSeconds * 0.9 : 0;
    const hasMetWatchThreshold = isCompleted || (video.durationSeconds > 0 && watchedSeconds >= threshold);

    // Upsert candidate progress
    const currentProgress = await prisma.tridinCandidateProgress.findUnique({
      where: {
        userId_videoId: { userId, videoId },
      },
    });

    let newWatchCompleted = currentProgress?.watchCompleted || false;
    let newCanAttemptAssessment = currentProgress?.canAttemptAssessment || false;

    if (hasMetWatchThreshold) {
      newWatchCompleted = true;
      newCanAttemptAssessment = true;
    }

    const progress = await prisma.tridinCandidateProgress.upsert({
      where: {
        userId_videoId: { userId, videoId },
      },
      update: {
        watchedSeconds: Math.max(watchedSeconds, currentProgress?.watchedSeconds || 0),
        watchCompleted: newWatchCompleted,
        canAttemptAssessment: newCanAttemptAssessment,
      },
      create: {
        userId,
        videoId,
        watchedSeconds,
        watchCompleted: newWatchCompleted,
        canAttemptAssessment: newCanAttemptAssessment,
      },
    });

    return res.status(200).json({
      success: true,
      message: newWatchCompleted
        ? "Video completed! Assessment is now unlocked."
        : "Progress updated.",
      progress: {
        watchedSeconds: progress.watchedSeconds,
        watchCompleted: progress.watchCompleted,
        canAttemptAssessment: progress.canAttemptAssessment,
        isPassed: progress.isPassed,
      },
    });
  } catch (error) {
    console.error("recordVideoProgress error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to record video progress.",
      error: error.message,
    });
  }
};

// @desc    Get assessment questions for candidate (Excludes correct answers to prevent cheating!)
// @route   GET /api/tridin/videos/:videoId/assessment
// @access  Private (TRIDIN_CANDIDATE only)
const getCandidateAssessment = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.user.id;

    // Check candidate eligibility
    const progress = await prisma.tridinCandidateProgress.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });

    if (!progress || (!progress.canAttemptAssessment && !progress.isPassed)) {
      return res.status(403).json({
        success: false,
        message: "You must watch the full video before taking this assessment.",
      });
    }

    const assessment = await prisma.tridinAssessment.findUnique({
      where: { videoId },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            questionText: true,
            options: true,
            orderIndex: true,
            // SECURITY: Do NOT select correctOption or explanation!
          },
        },
      },
    });

    if (!assessment || assessment.questions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No assessment questions found for this video.",
      });
    }

    return res.status(200).json({
      success: true,
      assessment: {
        id: assessment.id,
        title: assessment.title,
        passingScore: assessment.passingScore,
        timeLimitMinutes: assessment.timeLimitMinutes,
        totalQuestions: assessment.questions.length,
        questions: assessment.questions,
      },
    });
  } catch (error) {
    console.error("getCandidateAssessment error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch assessment.",
      error: error.message,
    });
  }
};

// @desc    Submit assessment answers & evaluate (PASS -> unlock next video, FAIL -> force re-watch)
// @route   POST /api/tridin/videos/:videoId/assessment/submit
// @access  Private (TRIDIN_CANDIDATE only)
const submitCandidateAssessment = async (req, res) => {
  try {
    const { videoId } = req.params;
    const userId = req.user.id;
    const { answers = {} } = req.body; // e.g. { "q1-id": 0, "q2-id": 2 }

    const assessment = await prisma.tridinAssessment.findUnique({
      where: { videoId },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!assessment || assessment.questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Assessment not configured for this video.",
      });
    }

    // Grade each question
    let correctCount = 0;
    const totalQuestions = assessment.questions.length;

    const questionResults = assessment.questions.map((q) => {
      const selectedIndex = answers[q.id];
      const isCorrect = selectedIndex !== undefined && Number(selectedIndex) === q.correctOption;
      if (isCorrect) correctCount++;

      return {
        questionId: q.id,
        questionText: q.questionText,
        options: q.options,
        userSelected: selectedIndex !== undefined ? Number(selectedIndex) : null,
        correctOption: q.correctOption,
        isCorrect,
        explanation: q.explanation || null,
      };
    });

    const percentage = Math.round((correctCount / totalQuestions) * 100);
    const isPassed = percentage >= assessment.passingScore;

    // Record the attempt
    await prisma.tridinAssessmentAttempt.create({
      data: {
        userId,
        assessmentId: assessment.id,
        score: correctCount,
        totalQuestions,
        percentage,
        isPassed,
        answersSubmitted: answers,
      },
    });

    if (isPassed) {
      // ─────────────────────────────────────────────
      // CANDIDATE PASSED:
      // Mark module passed -> Next video auto-unlocks!
      // ─────────────────────────────────────────────
      await prisma.tridinCandidateProgress.update({
        where: { userId_videoId: { userId, videoId } },
        data: {
          isPassed: true,
          lastScorePercentage: percentage,
          totalAttempts: { increment: 1 },
        },
      });

      return res.status(200).json({
        success: true,
        isPassed: true,
        score: correctCount,
        totalQuestions,
        percentage,
        passingScore: assessment.passingScore,
        message: "Congratulations! You passed the assessment. The next video is now unlocked!",
        results: questionResults,
      });
    } else {
      // ─────────────────────────────────────────────
      // CANDIDATE FAILED:
      // STRICT GATEKEEPING RULE:
      // Assessment is re-locked! Candidate MUST re-watch
      // the video before they can take the test again!
      // ─────────────────────────────────────────────
      await prisma.tridinCandidateProgress.update({
        where: { userId_videoId: { userId, videoId } },
        data: {
          isPassed: false,
          watchCompleted: false,        // <-- Reset video completion!
          watchedSeconds: 0,            // <-- Reset watch time!
          canAttemptAssessment: false,  // <-- Lock assessment again!
          lastScorePercentage: percentage,
          totalAttempts: { increment: 1 },
        },
      });

      return res.status(200).json({
        success: true,
        isPassed: false,
        score: correctCount,
        totalQuestions,
        percentage,
        passingScore: assessment.passingScore,
        message: `You scored ${percentage}%. Pass mark is ${assessment.passingScore}%. As per training rules, you must re-watch the video completely before retrying the assessment.`,
        results: questionResults,
      });
    }
  } catch (error) {
    console.error("submitCandidateAssessment error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to evaluate assessment.",
      error: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TRAINER ENDPOINTS (Protected by protect / trainer)
// ─────────────────────────────────────────────────────────────────────────────

// @desc    List all Tridin courses belonging to or available to trainer (strictly Tridin-only)
// @route   GET /api/trainer/tridin/courses
// @access  Private (Trainer)
const getTrainerTridinCourses = async (req, res) => {
  try {
    const sessions = await prisma.liveSession.findMany({
      where: {
        isTridinOnly: true,
      },
      select: {
        id: true,
        title: true,
        subtitle: true,
        description: true,
        category: true,
        courseTitle: true,
        thumbnail: true,
        totalHours: true,
        totalDays: true,
        status: true,
        createdAt: true,
        _count: {
          select: { tridinVideos: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      courses: sessions,
    });
  } catch (error) {
    console.error("getTrainerTridinCourses error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch Tridin courses.",
      error: error.message,
    });
  }
};

// @desc    Create a dedicated Tridin course
// @route   POST /api/trainer/tridin/courses
// @access  Private (Trainer)
const createTrainerTridinCourse = async (req, res) => {
  try {
    const { title, description, category } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Course title is required.",
      });
    }

    let finalThumbnail = null;
    if (req.file) {
      const relative = getRelativeUploadPath(req.file.path);
      finalThumbnail = `${req.protocol}://${req.get("host")}/${relative}`;
    } else if (req.body.thumbnail) {
      finalThumbnail = req.body.thumbnail.trim();
    }

    const newCourse = await prisma.liveSession.create({
      data: {
        title: title.trim(),
        courseTitle: title.trim(),
        description: description ? description.trim() : null,
        category: category ? category.trim() : "Tridin Track",
        thumbnail: finalThumbnail,
        isTridinOnly: true,
        status: "active",
        publishState: "PUBLISHED",
        trainerId: req.user?.id || null,
      },
      select: {
        id: true,
        title: true,
        subtitle: true,
        description: true,
        category: true,
        courseTitle: true,
        thumbnail: true,
        isTridinOnly: true,
        createdAt: true,
        _count: {
          select: { tridinVideos: true },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Tridin course created successfully.",
      course: newCourse,
    });
  } catch (error) {
    console.error("createTrainerTridinCourse error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Tridin course.",
      error: error.message,
    });
  }
};

// @desc    Delete a dedicated Tridin course & its videos/assessments
// @route   DELETE /api/trainer/tridin/courses/:sessionId
// @access  Private (Trainer)
const deleteTrainerTridinCourse = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const existing = await prisma.liveSession.findUnique({
      where: { id: sessionId },
      select: { id: true, title: true, isTridinOnly: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    if (!existing.isTridinOnly) {
      return res.status(403).json({
        success: false,
        message: "Security violation: Only dedicated Tridin courses can be deleted here.",
      });
    }

    // Delete the Tridin course (cascade will delete its tridinVideos, questions, assessments)
    await prisma.liveSession.delete({
      where: { id: sessionId },
    });

    return res.status(200).json({
      success: true,
      message: `Tridin course '${existing.title}' deleted successfully.`,
    });
  } catch (error) {
    console.error("deleteTrainerTridinCourse error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete Tridin course.",
      error: error.message,
    });
  }
};

// @desc    List all videos for a course session (Trainer view)
// @route   GET /api/trainer/tridin/courses/:sessionId/videos
// @access  Private (Trainer)
const getTrainerCourseVideos = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const videos = await prisma.tridinVideo.findMany({
      where: { sessionId },
      orderBy: { orderIndex: "asc" },
      include: {
        assessment: {
          include: {
            questions: {
              orderBy: { orderIndex: "asc" },
            },
          },
        },
        _count: {
          select: { candidateProgress: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      videos,
    });
  } catch (error) {
    console.error("getTrainerCourseVideos error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch videos.",
      error: error.message,
    });
  }
};

// @desc    Add a video to the course playlist (Trainer)
// @route   POST /api/trainer/tridin/courses/:sessionId/videos
// @access  Private (Trainer)
const addTrainerCourseVideo = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const {
      title,
      description,
      videoUrl,
      durationSeconds = 0,
      orderIndex,
      thumbnailUrl,
    } = req.body;

    // req.files comes from videoUpload.fields()
    const videoFileMulr = req.files?.["videoFile"]?.[0] || null;
    const thumbnailFileMulr = req.files?.["thumbnail"]?.[0] || req.file || null;

    // ── Determine source of video ────────────────────────────────────────────
    let finalVideoUrl = null;
    let finalYoutubeId = null;
    let finalVideoType = "YOUTUBE";

    if (videoFileMulr) {
      // Direct video file was uploaded
      const relative = getRelativeUploadPath(videoFileMulr.path);
      finalVideoUrl = `${req.protocol}://${req.get("host")}/${relative}`;
      finalVideoType = "UPLOAD";
    } else if (videoUrl && videoUrl.trim()) {
      // YouTube URL or direct URL string
      finalYoutubeId = parseYouTubeId(videoUrl);
      finalVideoType = finalYoutubeId ? "YOUTUBE" : "DIRECT_URL";
      finalVideoUrl = finalYoutubeId
        ? `https://www.youtube.com/watch?v=${finalYoutubeId}`
        : videoUrl.trim();
    } else {
      return res.status(400).json({
        success: false,
        message: "Either a video file upload or a Video URL is required.",
      });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Video title is required.",
      });
    }

    // ── Determine thumbnail ──────────────────────────────────────────────────
    let finalThumbnail = null;
    if (thumbnailFileMulr) {
      const relative = getRelativeUploadPath(thumbnailFileMulr.path);
      finalThumbnail = `${req.protocol}://${req.get("host")}/${relative}`;
    } else if (thumbnailUrl && thumbnailUrl !== "null" && thumbnailUrl !== "undefined") {
      finalThumbnail = thumbnailUrl.trim();
    } else if (finalYoutubeId) {
      finalThumbnail = `https://img.youtube.com/vi/${finalYoutubeId}/hqdefault.jpg`;
    }

    // Auto orderIndex if not supplied
    let finalOrderIndex = orderIndex;
    if (!finalOrderIndex) {
      const highest = await prisma.tridinVideo.findFirst({
        where: { sessionId },
        orderBy: { orderIndex: "desc" },
        select: { orderIndex: true },
      });
      finalOrderIndex = (highest?.orderIndex || 0) + 1;
    }

    const newVideo = await prisma.tridinVideo.create({
      data: {
        sessionId,
        title: title.trim(),
        description: description ? description.trim() : null,
        videoType: finalVideoType,
        videoUrl: finalVideoUrl,
        youtubeId: finalYoutubeId,
        durationSeconds: Number(durationSeconds) || 0,
        orderIndex: Number(finalOrderIndex),
        thumbnailUrl: finalThumbnail,
      },
    });

    // Auto-mark session as isTridinOnly so it immediately shows up for Tridin candidates
    await prisma.liveSession.update({
      where: { id: sessionId },
      data: { isTridinOnly: true },
    }).catch((err) => console.warn("Failed to auto-mark session isTridinOnly:", err.message));

    return res.status(201).json({
      success: true,
      message: "Video added to playlist successfully.",
      video: newVideo,
    });
  } catch (error) {
    console.error("addTrainerCourseVideo error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add video.",
      error: error.message,
    });
  }
};

// @desc    Update a video in the playlist (Trainer)
// @route   PUT /api/trainer/tridin/videos/:videoId
// @access  Private (Trainer)
const updateTrainerCourseVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { title, description, videoUrl, durationSeconds, orderIndex, thumbnailUrl } = req.body;

    const videoFileMulr = req.files?.["videoFile"]?.[0] || null;
    const thumbnailFileMulr = req.files?.["thumbnail"]?.[0] || req.file || null;

    const updateData = {};
    if (title) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (durationSeconds !== undefined) updateData.durationSeconds = Number(durationSeconds) || 0;
    if (orderIndex !== undefined) updateData.orderIndex = Number(orderIndex);

    // Check if a new video file was uploaded
    if (videoFileMulr) {
      const relative = getRelativeUploadPath(videoFileMulr.path);
      updateData.videoUrl = `${req.protocol}://${req.get("host")}/${relative}`;
      updateData.videoType = "UPLOAD";
      updateData.youtubeId = null;
    } else if (videoUrl) {
      const youtubeId = parseYouTubeId(videoUrl);
      updateData.youtubeId = youtubeId;
      updateData.videoType = youtubeId ? "YOUTUBE" : "DIRECT_URL";
      updateData.videoUrl = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : videoUrl.trim();
      if (!thumbnailFileMulr && (!thumbnailUrl || thumbnailUrl === "null") && youtubeId) {
        updateData.thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
      }
    }

    // Check if a new thumbnail was uploaded
    if (thumbnailFileMulr) {
      const relative = getRelativeUploadPath(thumbnailFileMulr.path);
      updateData.thumbnailUrl = `${req.protocol}://${req.get("host")}/${relative}`;
    } else if (thumbnailUrl !== undefined && !updateData.thumbnailUrl) {
      updateData.thumbnailUrl = thumbnailUrl && thumbnailUrl !== "null" ? thumbnailUrl.trim() : null;
    }

    const updated = await prisma.tridinVideo.update({
      where: { id: videoId },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: "Video updated successfully.",
      video: updated,
    });
  } catch (error) {
    console.error("updateTrainerCourseVideo error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update video.",
      error: error.message,
    });
  }
};

// @desc    Delete a video from the playlist (Trainer)
// @route   DELETE /api/trainer/tridin/videos/:videoId
// @access  Private (Trainer)
const deleteTrainerCourseVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    await prisma.tridinVideo.delete({
      where: { id: videoId },
    });

    return res.status(200).json({
      success: true,
      message: "Video deleted successfully.",
    });
  } catch (error) {
    console.error("deleteTrainerCourseVideo error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete video.",
      error: error.message,
    });
  }
};

// @desc    Create or update Assessment with questions for a video (Trainer)
// @route   POST /api/trainer/tridin/videos/:videoId/assessment
// @access  Private (Trainer)
const setVideoAssessment = async (req, res) => {
  try {
    const { videoId } = req.params;
    const {
      title,
      passingScore = 70,
      timeLimitMinutes = 15,
      questions = [], // Array of { questionText, options: [], correctOption: 0, explanation: "" }
    } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one question is required for the assessment.",
      });
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.questionText || !Array.isArray(q.options) || q.options.length < 2) {
        return res.status(400).json({
          success: false,
          message: `Question #${i + 1} must have question text and at least 2 options.`,
        });
      }
      if (q.correctOption === undefined || q.correctOption < 0 || q.correctOption >= q.options.length) {
        return res.status(400).json({
          success: false,
          message: `Question #${i + 1} has an invalid correctOption index.`,
        });
      }
    }

    // Upsert assessment
    const assessment = await prisma.tridinAssessment.upsert({
      where: { videoId },
      update: {
        title: title || "Video Assessment",
        passingScore: Number(passingScore) || 70,
        timeLimitMinutes: Number(timeLimitMinutes) || 15,
      },
      create: {
        videoId,
        title: title || "Video Assessment",
        passingScore: Number(passingScore) || 70,
        timeLimitMinutes: Number(timeLimitMinutes) || 15,
      },
    });

    // Delete existing questions and replace with updated ones
    await prisma.tridinQuestion.deleteMany({
      where: { assessmentId: assessment.id },
    });

    const questionData = questions.map((q, idx) => ({
      assessmentId: assessment.id,
      questionText: q.questionText.trim(),
      options: q.options,
      correctOption: Number(q.correctOption),
      explanation: q.explanation ? q.explanation.trim() : null,
      orderIndex: idx + 1,
    }));

    await prisma.tridinQuestion.createMany({
      data: questionData,
    });

    const fullAssessment = await prisma.tridinAssessment.findUnique({
      where: { id: assessment.id },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Assessment saved successfully.",
      assessment: fullAssessment,
    });
  } catch (error) {
    console.error("setVideoAssessment error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save assessment.",
      error: error.message,
    });
  }
};

// @desc    Candidate analytics & progress report for course (Trainer)
// @route   GET /api/trainer/tridin/courses/:sessionId/candidate-progress
// @access  Private (Trainer)
const getCourseCandidateAnalytics = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const videos = await prisma.tridinVideo.findMany({
      where: { sessionId },
      select: { id: true, title: true, orderIndex: true },
      orderBy: { orderIndex: "asc" },
    });

    const progressRecords = await prisma.tridinCandidateProgress.findMany({
      where: {
        videoId: { in: videos.map((v) => v.id) },
      },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, phoneNumber: true },
        },
        video: {
          select: { id: true, title: true, orderIndex: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      totalVideos: videos.length,
      records: progressRecords,
    });
  } catch (error) {
    console.error("getCourseCandidateAnalytics error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch candidate analytics.",
      error: error.message,
    });
  }
};

// @desc    Update main course session thumbnail
// @route   PATCH /api/trainer/tridin/courses/:sessionId/thumbnail
// @access  Private (Trainer)
const updateCourseThumbnail = async (req, res) => {
  try {
    const { sessionId } = req.params;
    let finalThumbnail = null;

    if (req.file) {
      const relative = getRelativeUploadPath(req.file.path);
      finalThumbnail = `${req.protocol}://${req.get("host")}/${relative}`;
    } else if (req.body.thumbnail) {
      finalThumbnail = req.body.thumbnail.trim();
    } else {
      return res.status(400).json({ success: false, message: "No thumbnail image provided." });
    }

    const updated = await prisma.liveSession.update({
      where: { id: sessionId },
      data: { thumbnail: finalThumbnail },
      select: { id: true, title: true, thumbnail: true },
    });

    return res.status(200).json({
      success: true,
      message: "Main course thumbnail updated successfully.",
      course: updated,
      thumbnail: finalThumbnail,
    });
  } catch (error) {
    console.error("updateCourseThumbnail error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update course thumbnail.",
      error: error.message,
    });
  }
};

module.exports = {
  // Candidate
  getCandidateCoursePlaylist,
  recordVideoProgress,
  getCandidateAssessment,
  submitCandidateAssessment,
  // Trainer
  getTrainerTridinCourses,
  getTrainerCourseVideos,
  addTrainerCourseVideo,
  updateTrainerCourseVideo,
  deleteTrainerCourseVideo,
  setVideoAssessment,
  getCourseCandidateAnalytics,
  updateCourseThumbnail,
  createTrainerTridinCourse,
  deleteTrainerTridinCourse,
};
