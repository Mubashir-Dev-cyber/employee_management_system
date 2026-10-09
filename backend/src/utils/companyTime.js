// Work days and shift times are in the company's timezone, whatever timezone the server runs in.
// Days are "YYYY-MM-DD" keys and clock times are "HH:MM".
const TIMEZONE = process.env.COMPANY_TIMEZONE || "Asia/Karachi";

let formatter;
try {
  formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
} catch {
  throw new Error(`COMPANY_TIMEZONE "${TIMEZONE}" is not a valid timezone (e.g. Asia/Karachi). Fix backend/.env.`);
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isTime = (value) => typeof value === "string" && TIME_PATTERN.test(value);

// "09:05" -> 545 minutes after midnight
const toMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// ---------- Day keys (calendar days, no time of day) ----------

// DATE columns hold the calendar day as UTC midnight.
const asDbDate = (key) => new Date(`${key}T00:00:00.000Z`);
const toDateKey = (date) => date.toISOString().slice(0, 10);

// A real calendar day written YYYY-MM-DD (so 2026-02-30 is not).
const isDateKey = (value) => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = asDbDate(value);
  return !Number.isNaN(date.getTime()) && toDateKey(date) === value;
};

const addDays = (key, days) => {
  const date = asDbDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
};

// Saturday or Sunday
const isWeekend = (key) => [0, 6].includes(asDbDate(key).getUTCDay());

// ---------- Moments in company time ----------

// The company's calendar day and clock time at a moment.
const companyParts = (instant) => {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};

const todayKey = (now = new Date()) => companyParts(now).dateKey;
const nowMinutes = (now = new Date()) => toMinutes(companyParts(now).time);
const toCompanyTime = (instant) => companyParts(instant).time;

// "09:00" on a company day -> the exact UTC moment. Starts as if the company were on UTC, then
// moves by the difference the timezone shows; a second pass covers a daylight-saving change.
const fromCompanyTime = (dateKey, time) => {
  const wanted = Date.parse(`${dateKey}T${time}:00.000Z`);
  let instant = wanted;
  for (let pass = 0; pass < 2; pass++) {
    const shown = companyParts(new Date(instant));
    instant += wanted - Date.parse(`${shown.dateKey}T${shown.time}:00.000Z`);
  }
  return new Date(instant);
};

module.exports = {
  TIMEZONE,
  isTime,
  toMinutes,
  asDbDate,
  toDateKey,
  isDateKey,
  addDays,
  isWeekend,
  todayKey,
  nowMinutes,
  toCompanyTime,
  fromCompanyTime,
};
