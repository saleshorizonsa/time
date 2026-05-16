const express = require("express");
const { buildDeviceOptions, ingestAttLog, logDeviceRequest } = require("../services/zktecoAdmsService");

const router = express.Router();

router.use(express.text({ type: "*/*", limit: "2mb" }));

router.get("/cdata", async (req, res, next) => {
  try {
    const serialNumber = req.query.SN || req.query.sn;
    await logDeviceRequest("zkteco-adms", "Device requested ADMS options.", {
      serialNumber,
      query: req.query
    });
    res.type("text/plain").send(buildDeviceOptions(serialNumber));
  } catch (error) {
    next(error);
  }
});

router.post("/cdata", async (req, res, next) => {
  try {
    const serialNumber = req.query.SN || req.query.sn;
    const table = String(req.query.table || "").toUpperCase();
    if (table === "ATTLOG" || !table) {
      await ingestAttLog({ serialNumber, body: req.body });
    } else {
      await logDeviceRequest("zkteco-adms", "Device posted unsupported table.", {
        serialNumber,
        table,
        bodyLength: String(req.body || "").length
      });
    }
    res.type("text/plain").send("OK");
  } catch (error) {
    next(error);
  }
});

router.get("/getrequest", async (req, res) => {
  res.type("text/plain").send("OK");
});

router.post("/devicecmd", async (req, res) => {
  res.type("text/plain").send("OK");
});

router.get("/ping", (req, res) => {
  res.type("text/plain").send("OK");
});

module.exports = router;
