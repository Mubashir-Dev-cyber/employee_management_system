const express = require("express");
const managerController = require("../controllers/managerController");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const { decisionSchema } = require("../validators/managerSchema");
const { correctionRequestSchema } = require("../validators/attendanceSchema");

const router = express.Router();

// Only MANAGER accounts; each one only ever sees its own team.
router.use(requireAuth, requireRole("MANAGER"));

router.get("/team", managerController.getTeam);

router.get("/team/:id", managerController.getTeamMember);

router.get("/team/:id/leave-requests", managerController.getMemberLeave);

router.get("/team/:id/attendance", managerController.getMemberAttendance);

router.get("/leave-requests", managerController.getLeaveRequests);

router.patch("/leave-requests/:id", validate(decisionSchema), managerController.decideLeave);

router.get("/attendance", managerController.getAttendance);

// Managers can't change attendance; they ask HR to correct it.
router.get("/attendance-corrections", managerController.getCorrections);

router.post("/attendance-corrections", validate(correctionRequestSchema), managerController.requestCorrection);

module.exports = router;
