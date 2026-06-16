const prisma = require('../config/db');
const { PAGINATION_DEFAULTS } = require('../constants/attendance.constants');

/**
 * Finds a student (User) by their ID.
 * @param {string} studentId - The user ID (plain string, stored in AttendanceRecord).
 * @returns {Promise<Object|null>} The user record or null.
 */
const findStudentById = async (studentId) => {
  const id = parseInt(studentId, 10);
  if (Number.isNaN(id)) return null;

  const student = await prisma.user.findFirst({
    where: { id },
  });
  return student;
};

/**
 * Validates that the given string is a valid student ID (non-empty, numeric for this schema).
 * @param {string} id - The string to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  const parsed = parseInt(id, 10);
  return !Number.isNaN(parsed) && parsed > 0;
};

/**
 * Retrieves the attendance overview for a specific student.
 *
 * Uses Prisma groupBy to aggregate attendance counts by status,
 * then derives totalClasses, presentClasses, missedClasses, and attendancePercentage.
 *
 * @param {string} studentId - The student ID (stored as String in AttendanceRecord).
 * @returns {Promise<Object>} Overview object.
 */
const getAttendanceOverview = async (studentId) => {
  const id = parseInt(studentId, 10);
  const grouped = await prisma.attendance.groupBy({
    by: ['status'],
    where: { studentId: id },
    _count: { status: true },
  });

  let presentClasses = 0;
  let missedClasses = 0;

  for (const group of grouped) {
    if (group.status === 'present' || group.status === 'joined' || group.status === 'completed') {
      presentClasses += group._count.status;
    } else {
      missedClasses += group._count.status;
    }
  }

  const totalClasses = presentClasses + missedClasses;

  return {
    totalClasses,
    presentClasses,
    missedClasses,
  };
};

/**
 * Retrieves paginated attendance history for a specific student.
 *
 * Records are sorted by session scheduledAt descending (newest first).
 * Each record includes the session's subject and scheduledAt, plus the attendance status.
 *
 * @param {string} studentId - The student ID.
 * @param {Object} [options] - Pagination options.
 * @param {number} [options.page=1] - Current page number (1-indexed).
 * @param {number} [options.limit=10] - Number of records per page.
 * @returns {Promise<Object>} Object containing { records, pagination }.
 */
const getAttendanceHistory = async (studentId, options = {}) => {
  const page = Math.max(1, parseInt(options.page, 10) || PAGINATION_DEFAULTS.PAGE);
  const limit = Math.max(1, parseInt(options.limit, 10) || PAGINATION_DEFAULTS.LIMIT);
  const skip = (page - 1) * limit;

  const id = parseInt(studentId, 10);

  // Run count and data queries in parallel for performance
  const [total, records] = await Promise.all([
    prisma.attendance.count({ where: { studentId: id } }),
    prisma.attendance.findMany({
      where: { studentId: id },
      orderBy: { occurrenceDate: 'desc' },
      select: {
        status: true,
        occurrenceDate: true,
        session: {
          select: {
            title: true,
          },
        },
      },
      skip,
      take: limit,
    }),
  ]);

  // Transform records to match the API response shape
  const data = records.map((record) => {
    let mappedStatus = 'missed';
    if (record.status === 'present' || record.status === 'joined' || record.status === 'completed') {
      mappedStatus = 'present';
    }
    return {
      date: record.occurrenceDate,
      subject: record.session ? record.session.title : 'Unknown',
      status: mappedStatus,
    };
  });

  const totalPages = Math.ceil(total / limit);

  return {
    records: data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  };
};

module.exports = {
  isValidObjectId,
  findStudentById,
  getAttendanceOverview,
  getAttendanceHistory,
};
