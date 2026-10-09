const { TIMEZONE, isTime, isWeekend, nowMinutes, toCompanyTime, toMinutes, todayKey } = require("./companyTime");

// One shift for everyone, Monday to Friday, set in backend/.env. Checked once at startup.
const readTime = (name, fallback) => {
  const value = process.env[name] || fallback;
  if (!isTime(value)) {
    throw new Error(`${name} must be a time like 09:00 (got "${value}"). Fix backend/.env.`);
  }
  return value;
};

const start = readTime("SHIFT_START", "09:00");
const end = readTime("SHIFT_END", "17:00");
const graceMinutes = Number(process.env.LATE_GRACE_MINUTES || "5");

if (toMinutes(end) <= toMinutes(start)) {
  throw new Error("SHIFT_END must be after SHIFT_START. Fix backend/.env.");
}
if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 120) {
  throw new Error("LATE_GRACE_MINUTES must be a whole number from 0 to 120. Fix backend/.env.");
}

const SHIFT = Object.freeze({ start, end, graceMinutes, timezone: TIMEZONE });

// Managers can ask HR to correct today and the 6 days before it.
const CORRECTION_WINDOW_DAYS = 7;

const STATUSES = ["PRESENT", "LATE", "ABSENT", "ON_LEAVE", "NOT_IN", "OFF"];

// The status of one person's day. `record` is their Attendance row for that day, or null.
const attendanceStatus = ({ dateKey, hireDateKey, onLeave, record, now = new Date() }) => {
  if (isWeekend(dateKey) || dateKey < hireDateKey) return "OFF";
  if (onLeave) return "ON_LEAVE";

  if (record) {
    const late = toMinutes(toCompanyTime(record.checkIn)) > toMinutes(SHIFT.start) + SHIFT.graceMinutes;
    return late ? "LATE" : "PRESENT";
  }

  // Nobody counts as absent until the shift is over.
  if (dateKey === todayKey(now) && nowMinutes(now) < toMinutes(SHIFT.end)) return "NOT_IN";
  return "ABSENT";
};

module.exports = { SHIFT, CORRECTION_WINDOW_DAYS, STATUSES, attendanceStatus };
