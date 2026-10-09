const attendanceService = require("../services/attendanceService");
const AppError = require("../utils/AppError");
const parseId = require("../utils/parseId");
const { CORRECTION_STATUSES } = require("../validators/attendanceSchema");

// HR admins see every team's correction requests.
const getCorrections = async (req, res) => {
  const { status } = req.query;

  if (status !== undefined && !CORRECTION_STATUSES.includes(status)) {
    throw new AppError(`status must be one of: ${CORRECTION_STATUSES.join(", ")}`, 400);
  }

  const corrections = await attendanceService.listAllCorrections(status);

  res.status(200).json({
    message: "Corrections retrieved successfully",
    corrections,
  });
};

// The signed-in HR admin is recorded as the one who decided.
const decideCorrection = async (req, res) => {
  const correction = await attendanceService.decideCorrection(
    req.admin.id,
    parseId(req.params.id, "Correction id"),
    req.body
  );

  res.status(200).json({
    message: `Correction ${correction.status.toLowerCase()}`,
    correction,
  });
};

module.exports = {
  getCorrections,
  decideCorrection,
};
