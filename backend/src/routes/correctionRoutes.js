const express = require("express");
const correctionController = require("../controllers/correctionController");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const { decisionSchema } = require("../validators/managerSchema");

const router = express.Router();

// Only HR admins decide attendance corrections that managers asked for.
router.use(requireAuth, requireRole("HR_ADMIN"));

router.get("/", correctionController.getCorrections);

router.patch("/:id", validate(decisionSchema), correctionController.decideCorrection);

module.exports = router;
