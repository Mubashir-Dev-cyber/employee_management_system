const AppError = require("./AppError");
const { isDateKey } = require("./companyTime");

// Checks a route or query value is a real day written YYYY-MM-DD, or throws a 400.
const parseDateKey = (value, label = "date") => {
  if (!isDateKey(value)) {
    throw new AppError(`${label} must be a date like 2026-10-09`, 400);
  }

  return value;
};

module.exports = parseDateKey;
