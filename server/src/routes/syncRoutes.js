const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { getSyncStatus, pullAttendanceData } = require("../services/syncService");
const { pullFromZktecoDevice } = require("../services/zktecoPullService");

const router = express.Router();
router.use(requireAuth);

router.get("/status", async (req, res, next) => {
  try {
    res.json(await getSyncStatus());
  } catch (error) {
    next(error);
  }
});

router.post("/pull-now", requireRole("Admin"), async (req, res, next) => {
  try {
    res.json(await pullAttendanceData());
  } catch (error) {
    next(error);
  }
});

router.post("/pull-zkteco-now", requireRole("Admin"), async (req, res, next) => {
  try {
    res.json(await pullFromZktecoDevice());
  } catch (error) {
    next(error);
  }
});

module.exports = router;
