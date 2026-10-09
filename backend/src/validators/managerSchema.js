const { z } = require("zod");

const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED"];

// Body of PATCH /api/manager/leave-requests/:id and PATCH /api/attendance-corrections/:id
const decisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"], {
    error: "status must be APPROVED or REJECTED",
  }),
  note: z.string().trim().max(500, "note must be at most 500 characters").nullish(),
});

module.exports = { LEAVE_STATUSES, decisionSchema };
