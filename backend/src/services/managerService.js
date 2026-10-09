const prisma = require("../utils/prisma");
const AppError = require("../utils/AppError");
// startDate/endDate are DATE columns, read back as UTC midnight.
const { toDateKey } = require("../utils/companyTime");

const getManager = async (managerId) => {
  const manager = await prisma.employee.findUnique({
    where: { id: managerId },
    select: { id: true, employeeId: true, firstName: true, lastName: true },
  });

  return manager;
};

// Everyone whose manager is managerId.
const getTeam = async (managerId) => {
  const team = await prisma.employee.findMany({
    where: { managerId },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  return team;
};

// One employee, but only if they're in managerId's team.
const getTeamMember = async (managerId, id) => {
  const employee = await prisma.employee.findFirst({
    where: { id, managerId },
  });

  return employee;
};

// ---------- Leave requests ----------

const leaveInclude = {
  employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, department: true } },
};

// The shape the mobile app uses.
const toLeaveDto = (row) => ({
  id: row.id,
  employeeId: row.employee.employeeId,
  employeeDbId: row.employee.id,
  employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
  department: row.employee.department,
  type: row.type,
  startDate: toDateKey(row.startDate),
  endDate: toDateKey(row.endDate),
  days: row.days,
  reason: row.reason,
  status: row.status,
  requestedAt: row.createdAt.toISOString(),
  decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  decisionNote: row.decisionNote,
});

// Pending first (soonest leave first), then decided (most recent decision first).
const compareLeave = (a, b) => {
  const aPending = a.status === "PENDING";
  const bPending = b.status === "PENDING";
  if (aPending !== bPending) return aPending ? -1 : 1;
  if (aPending) return a.startDate.localeCompare(b.startDate);
  return (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "");
};

// The team's leave requests, optionally only one status.
const listLeave = async (managerId, status) => {
  const rows = await prisma.leaveRequest.findMany({
    where: { employee: { managerId }, ...(status && { status }) },
    include: leaveInclude,
  });

  return rows.map(toLeaveDto).sort(compareLeave);
};

// One team member's leave history, or null if they aren't in the team.
const listMemberLeave = async (managerId, employeeId) => {
  const member = await getTeamMember(managerId, employeeId);
  if (!member) return null;

  const rows = await prisma.leaveRequest.findMany({
    where: { employeeId },
    include: leaveInclude,
  });

  return rows.map(toLeaveDto).sort(compareLeave);
};

const decideLeave = async (managerId, id, { status, note }) => {
  const existing = await prisma.leaveRequest.findFirst({
    where: { id, employee: { managerId } },
  });

  if (!existing) {
    throw new AppError("Leave request not found", 404);
  }

  // Only a still-pending request in this team changes, checked in the same
  // statement as the update, so two decisions can't both win.
  const { count } = await prisma.leaveRequest.updateMany({
    where: { id, status: "PENDING", employee: { managerId } },
    data: { status, decidedAt: new Date(), decidedById: managerId, decisionNote: note || null },
  });

  if (count === 0) {
    throw new AppError("This request has already been decided", 409);
  }

  const updated = await prisma.leaveRequest.findUnique({ where: { id }, include: leaveInclude });
  return toLeaveDto(updated);
};

module.exports = {
  getManager,
  getTeam,
  getTeamMember,
  listLeave,
  listMemberLeave,
  decideLeave,
};
