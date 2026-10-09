const managerService = require("../services/managerService");
const attendanceService = require("../services/attendanceService");
const AppError = require("../utils/AppError");
const parseId = require("../utils/parseId");
const parseDateKey = require("../utils/parseDateKey");
const { todayKey } = require("../utils/companyTime");
const { LEAVE_STATUSES } = require("../validators/managerSchema");
const { CORRECTION_STATUSES } = require("../validators/attendanceSchema");

// The manager is always the signed-in MANAGER account's own employee, never a
// value from the request, so nobody can open another manager's team.
const resolveManager = async (req) => {
  const manager = req.admin.employeeId ? await managerService.getManager(req.admin.employeeId) : null;

  if (!manager) {
    throw new AppError("This manager account isn't linked to an employee", 403);
  }

  return manager;
};

const getTeam = async (req, res) => {
  const manager = await resolveManager(req);
  const team = await managerService.getTeam(manager.id);

  res.status(200).json({
    message: "Team retrieved successfully",
    manager,
    team,
  });
};

const getTeamMember = async (req, res) => {
  const manager = await resolveManager(req);
  const employee = await managerService.getTeamMember(manager.id, parseId(req.params.id, "Employee id"));

  if (!employee) {
    throw new AppError("Team member not found", 404);
  }

  res.status(200).json({
    message: "Team member retrieved successfully",
    employee,
  });
};

const getLeaveRequests = async (req, res) => {
  const manager = await resolveManager(req);
  const { status } = req.query;

  if (status !== undefined && !LEAVE_STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${LEAVE_STATUSES.join(", ")}`, 400);
  }

  const leaveRequests = await managerService.listLeave(manager.id, status);

  res.status(200).json({
    message: "Leave requests retrieved successfully",
    leaveRequests,
  });
};

const getMemberLeave = async (req, res) => {
  const manager = await resolveManager(req);
  const leaveRequests = await managerService.listMemberLeave(manager.id, parseId(req.params.id, "Employee id"));

  if (!leaveRequests) {
    throw new AppError("Team member not found", 404);
  }

  res.status(200).json({
    message: "Leave requests retrieved successfully",
    leaveRequests,
  });
};

const decideLeave = async (req, res) => {
  const manager = await resolveManager(req);
  const leaveRequest = await managerService.decideLeave(
    manager.id,
    parseId(req.params.id, "Leave request id"),
    req.body
  );

  res.status(200).json({
    message: `Leave request ${leaveRequest.status.toLowerCase()}`,
    leaveRequest,
  });
};

// ---------- Attendance ----------

const MAX_HISTORY_DAYS = 31;

const parseDays = (value) => {
  if (value === undefined) return 7;

  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_HISTORY_DAYS) {
    throw new AppError(`days must be a whole number from 1 to ${MAX_HISTORY_DAYS}`, 400);
  }

  return days;
};

const getAttendance = async (req, res) => {
  const manager = await resolveManager(req);
  const date = req.query.date === undefined ? todayKey() : parseDateKey(req.query.date);
  const day = await attendanceService.getTeamDay(manager.id, date);

  res.status(200).json({
    message: "Attendance retrieved successfully",
    ...day,
  });
};

const getMemberAttendance = async (req, res) => {
  const manager = await resolveManager(req);
  const history = await attendanceService.getMemberHistory(
    manager.id,
    parseId(req.params.id, "Employee id"),
    parseDays(req.query.days)
  );

  if (!history) {
    throw new AppError("Team member not found", 404);
  }

  res.status(200).json({
    message: "Attendance retrieved successfully",
    ...history,
  });
};

const getCorrections = async (req, res) => {
  const manager = await resolveManager(req);
  const { status } = req.query;

  if (status !== undefined && !CORRECTION_STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${CORRECTION_STATUSES.join(", ")}`, 400);
  }

  const corrections = await attendanceService.listTeamCorrections(manager.id, status);

  res.status(200).json({
    message: "Corrections retrieved successfully",
    corrections,
  });
};

const requestCorrection = async (req, res) => {
  const manager = await resolveManager(req);
  const correction = await attendanceService.requestCorrection(manager.id, req.body);

  res.status(201).json({
    message: "Correction sent to HR",
    correction,
  });
};

module.exports = {
  getTeam,
  getTeamMember,
  getLeaveRequests,
  getMemberLeave,
  decideLeave,
  getAttendance,
  getMemberAttendance,
  getCorrections,
  requestCorrection,
};
