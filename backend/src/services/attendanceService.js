const prisma = require("../utils/prisma");
const AppError = require("../utils/AppError");
const managerService = require("./managerService");
const {
  addDays,
  asDbDate,
  fromCompanyTime,
  isWeekend,
  nowMinutes,
  toCompanyTime,
  toDateKey,
  toMinutes,
  todayKey,
} = require("../utils/companyTime");
const { SHIFT, CORRECTION_WINDOW_DAYS, STATUSES, attendanceStatus } = require("../utils/attendanceRules");

// ---------- Shared helpers ----------

const time = (instant) => (instant ? toCompanyTime(instant) : null);
const times = (checkIn, checkOut) => ({ checkIn: time(checkIn), checkOut: time(checkOut) });
const fullName = (person) => (person ? `${person.firstName} ${person.lastName}`.trim() : null);

// The first day a manager can still ask HR to correct.
const windowStart = (now) => addDays(todayKey(now), -(CORRECTION_WINDOW_DAYS - 1));

const coversDay = (leave, dateKey) => toDateKey(leave.startDate) <= dateKey && dateKey <= toDateKey(leave.endDate);

// Only the fields the attendance screens show.
const toEmployeeDto = ({ id, employeeId, firstName, lastName, department, position }) => ({
  id,
  employeeId,
  firstName,
  lastName,
  department,
  position,
});

// A waiting correction matters most, then the latest approved one. `corrections` is newest first.
const pickCorrection = (corrections) =>
  corrections.find((c) => c.status === "PENDING") ?? corrections.find((c) => c.status === "APPROVED") ?? null;

// One person's day as the app shows it.
const toRecord = ({ employee, dateKey, row, onLeave, corrections, now }) => {
  const status = attendanceStatus({ dateKey, hireDateKey: toDateKey(employee.hireDate), onLeave, record: row, now });
  const correction = pickCorrection(corrections);

  return {
    date: dateKey,
    status,
    ...times(row?.checkIn, row?.checkOut),
    correction: correction && { id: correction.id, status: correction.status },
    // Whether the manager may ask HR to fix this day now
    correctable:
      !["OFF", "ON_LEAVE"].includes(status) &&
      dateKey >= windowStart(now) &&
      dateKey <= todayKey(now) &&
      correction?.status !== "PENDING",
  };
};

const countStatuses = (records) =>
  Object.fromEntries(STATUSES.map((status) => [status, records.filter((r) => r.status === status).length]));

const approvedLeaveOn = (date) => ({ status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } });
const VISIBLE_CORRECTIONS = { status: { in: ["PENDING", "APPROVED"] } };

// ---------- Viewing attendance (managers) ----------

// Every team member's record for one day.
const getTeamDay = async (managerId, dateKey, now = new Date()) => {
  if (dateKey > todayKey(now)) {
    throw new AppError("date can't be in the future", 400);
  }

  const date = asDbDate(dateKey);
  const inTeam = { employee: { managerId } };

  const [team, rows, leave, corrections] = await Promise.all([
    managerService.getTeam(managerId),
    prisma.attendance.findMany({ where: { date, ...inTeam } }),
    prisma.leaveRequest.findMany({ where: { ...approvedLeaveOn(date), ...inTeam } }),
    prisma.attendanceCorrection.findMany({
      where: { date, ...VISIBLE_CORRECTIONS, ...inTeam },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const results = team.map((employee) => ({
    employee: toEmployeeDto(employee),
    record: toRecord({
      employee,
      dateKey,
      row: rows.find((r) => r.employeeId === employee.id) ?? null,
      onLeave: leave.some((l) => l.employeeId === employee.id),
      corrections: corrections.filter((c) => c.employeeId === employee.id),
      now,
    }),
  }));

  return {
    date: dateKey,
    workday: !isWeekend(dateKey),
    shift: SHIFT,
    rows: results,
    counts: countStatuses(results.map((r) => r.record)),
  };
};

// One team member's last `days` days, newest first, or null if they aren't in the team.
const getMemberHistory = async (managerId, employeeId, days, now = new Date()) => {
  const employee = await managerService.getTeamMember(managerId, employeeId);
  if (!employee) return null;

  const today = todayKey(now);
  const from = addDays(today, -(days - 1));
  const range = { gte: asDbDate(from), lte: asDbDate(today) };

  const [rows, leave, corrections] = await Promise.all([
    prisma.attendance.findMany({ where: { employeeId, date: range } }),
    prisma.leaveRequest.findMany({
      where: { employeeId, status: "APPROVED", startDate: { lte: range.lte }, endDate: { gte: range.gte } },
    }),
    prisma.attendanceCorrection.findMany({
      where: { employeeId, date: range, ...VISIBLE_CORRECTIONS },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const records = Array.from({ length: days }, (_, i) => {
    const dateKey = addDays(today, -i);
    return toRecord({
      employee,
      dateKey,
      row: rows.find((r) => toDateKey(r.date) === dateKey) ?? null,
      onLeave: leave.some((l) => coversDay(l, dateKey)),
      corrections: corrections.filter((c) => toDateKey(c.date) === dateKey),
      now,
    });
  });

  return { employee: toEmployeeDto(employee), shift: SHIFT, records };
};

// ---------- Correction requests ----------

const correctionInclude = {
  employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, department: true } },
  requestedBy: { select: { firstName: true, lastName: true } },
  decidedBy: { select: { name: true } },
};

// `current` is the person's Attendance row for that day right now (or null).
const toCorrectionDto = (row, current) => {
  // Once approved, the record already shows the new times, so "before" is what it said then.
  let before = null;
  if (row.status === "APPROVED") {
    if (row.previousCheckIn) before = times(row.previousCheckIn, row.previousCheckOut);
  } else if (current) {
    before = times(current.checkIn, current.checkOut);
  }

  return {
    id: row.id,
    employeeId: row.employee.employeeId,
    employeeDbId: row.employee.id,
    employeeName: fullName(row.employee),
    department: row.employee.department,
    date: toDateKey(row.date),
    requested: times(row.checkIn, row.checkOut),
    before,
    reason: row.reason,
    status: row.status,
    requestedBy: fullName(row.requestedBy),
    requestedAt: row.createdAt.toISOString(),
    decidedBy: row.decidedBy?.name ?? null,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    decisionNote: row.decisionNote,
  };
};

// Pending first (oldest day first, like a queue), then decided (most recent decision first).
const compareCorrections = (a, b) => {
  const aPending = a.status === "PENDING";
  const bPending = b.status === "PENDING";
  if (aPending !== bPending) return aPending ? -1 : 1;
  if (aPending) return a.date.localeCompare(b.date) || a.id - b.id;
  return (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "");
};

const listCorrections = async (where) => {
  const rows = await prisma.attendanceCorrection.findMany({ where, include: correctionInclude });
  if (rows.length === 0) return [];

  // The current record of each requested day, to show what would change.
  const current = await prisma.attendance.findMany({
    where: { OR: rows.map(({ employeeId, date }) => ({ employeeId, date })) },
  });
  const currentFor = (row) =>
    current.find((r) => r.employeeId === row.employeeId && r.date.getTime() === row.date.getTime()) ?? null;

  return rows.map((row) => toCorrectionDto(row, currentFor(row))).sort(compareCorrections);
};

// A manager's view: only their team's requests.
const listTeamCorrections = (managerId, status) =>
  listCorrections({ employee: { managerId }, ...(status && { status }) });

// HR's view: every request.
const listAllCorrections = (status) => listCorrections(status ? { status } : {});

const getCorrection = async (id) => {
  const row = await prisma.attendanceCorrection.findUnique({ where: { id }, include: correctionInclude });
  const current = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: row.employeeId, date: row.date } },
  });
  return toCorrectionDto(row, current);
};

// A manager asks HR to fix one team member's day.
const requestCorrection = async (managerId, { employeeId, date: dateKey, checkIn, checkOut, reason }, now = new Date()) => {
  const employee = await managerService.getTeamMember(managerId, employeeId);
  if (!employee) {
    throw new AppError("Team member not found", 404);
  }

  const today = todayKey(now);
  if (dateKey > today) {
    throw new AppError("You can't correct a day that hasn't happened yet", 400);
  }
  if (dateKey < windowStart(now)) {
    throw new AppError(`Corrections can only be requested for the last ${CORRECTION_WINDOW_DAYS} days`, 400);
  }
  if (isWeekend(dateKey)) {
    throw new AppError("There is no shift on weekends", 400);
  }
  if (dateKey < toDateKey(employee.hireDate)) {
    throw new AppError("This day is before the employee was hired", 400);
  }
  if (dateKey === today && toMinutes(checkOut ?? checkIn) > nowMinutes(now)) {
    throw new AppError("Times can't be later than now", 400);
  }

  const date = asDbDate(dateKey);

  const onLeave = await prisma.leaveRequest.findFirst({ where: { employeeId, ...approvedLeaveOn(date) } });
  if (onLeave) {
    throw new AppError("This employee is on approved leave that day", 409);
  }

  // The app disables its button while sending, so a double request is unlikely; HR would see both.
  const waiting = await prisma.attendanceCorrection.findFirst({ where: { employeeId, date, status: "PENDING" } });
  if (waiting) {
    throw new AppError("A correction for this day is already waiting for HR", 409);
  }

  const created = await prisma.attendanceCorrection.create({
    data: {
      employeeId,
      date,
      checkIn: fromCompanyTime(dateKey, checkIn),
      checkOut: checkOut ? fromCompanyTime(dateKey, checkOut) : null,
      reason,
      requestedById: managerId,
    },
  });

  return getCorrection(created.id);
};

// An HR admin approves or rejects a request. Only approving changes the attendance record.
const decideCorrection = async (adminId, id, { status, note }) => {
  await prisma.$transaction(async (tx) => {
    // Only a still-pending request changes, checked in the same statement as the update,
    // so two decisions can't both win.
    const { count } = await tx.attendanceCorrection.updateMany({
      where: { id, status: "PENDING" },
      data: { status, decidedAt: new Date(), decidedById: adminId, decisionNote: note || null },
    });

    if (count === 0) {
      const exists = await tx.attendanceCorrection.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new AppError("Correction not found", 404);
      throw new AppError("This correction has already been decided", 409);
    }

    if (status !== "APPROVED") return;

    const correction = await tx.attendanceCorrection.findUnique({ where: { id } });
    const day = { employeeId_date: { employeeId: correction.employeeId, date: correction.date } };
    const current = await tx.attendance.findUnique({ where: day });

    // Keep what the record said, so the change can be traced later.
    await tx.attendanceCorrection.update({
      where: { id },
      data: { previousCheckIn: current?.checkIn ?? null, previousCheckOut: current?.checkOut ?? null },
    });

    // No check-out in the request keeps the recorded one, if it is still after the new check-in.
    const keptCheckOut = current?.checkOut > correction.checkIn ? current.checkOut : null;
    const fixed = { checkIn: correction.checkIn, checkOut: correction.checkOut ?? keptCheckOut };

    await tx.attendance.upsert({
      where: day,
      create: { employeeId: correction.employeeId, date: correction.date, ...fixed },
      update: fixed,
    });
  });

  return getCorrection(id);
};

module.exports = {
  getTeamDay,
  getMemberHistory,
  listTeamCorrections,
  listAllCorrections,
  requestCorrection,
  decideCorrection,
};
