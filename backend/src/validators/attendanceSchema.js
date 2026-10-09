const { z } = require("zod");
const { isDateKey, isTime } = require("../utils/companyTime");

const CORRECTION_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

const time = (field) => z.string({ error: `${field} is required` }).refine(isTime, `${field} must be a time like 09:05`);

// Body of POST /api/manager/attendance-corrections
const correctionRequestSchema = z
  .object({
    employeeId: z
      .number({ error: "employeeId must be a number" })
      .int("employeeId must be a positive integer")
      .positive("employeeId must be a positive integer")
      .max(2147483647, "employeeId is too large"),
    date: z.string({ error: "date is required" }).refine(isDateKey, "date must be a date like 2026-10-09"),
    checkIn: time("checkIn"),
    // Leave out to keep the check-out that is already recorded
    checkOut: time("checkOut").nullish(),
    reason: z
      .string({ error: "reason is required" })
      .trim()
      .min(3, "reason must be at least 3 characters")
      .max(500, "reason must be at most 500 characters"),
  })
  // "HH:MM" strings compare correctly as text
  .refine((body) => !body.checkOut || body.checkOut > body.checkIn, {
    path: ["checkOut"],
    message: "checkOut must be after checkIn",
  });

module.exports = { CORRECTION_STATUSES, correctionRequestSchema };
