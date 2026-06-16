/**
 * Attendance module constants
 * Centralizes all enums and magic values used across the attendance feature.
 */

/** Possible attendance statuses for a student in a class session */
const ATTENDANCE_STATUS = Object.freeze({
  PRESENT: 'present',
  MISSED: 'missed',
});

/** Allowed values for attendance status (used in schema validation) */
const ATTENDANCE_STATUS_VALUES = Object.freeze(
  Object.values(ATTENDANCE_STATUS)
);

/** User role enums */
const USER_ROLES = Object.freeze({
  STUDENT: 'student',
  ADMIN: 'admin',
});

/** Allowed values for user roles (used in schema validation) */
const USER_ROLE_VALUES = Object.freeze(Object.values(USER_ROLES));

/** Default pagination settings */
const PAGINATION_DEFAULTS = Object.freeze({
  PAGE: 1,
  LIMIT: 10,
});

/** Default class session duration in minutes */
const DEFAULT_SESSION_DURATION_MINUTES = 60;

module.exports = {
  ATTENDANCE_STATUS,
  ATTENDANCE_STATUS_VALUES,
  USER_ROLES,
  USER_ROLE_VALUES,
  PAGINATION_DEFAULTS,
  DEFAULT_SESSION_DURATION_MINUTES,
};
