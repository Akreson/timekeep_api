const express = require("express");

const {
  getUserDepartmentsAccessList,
  getDvisionTimekeepInfo,
  getUserTimekeepLog,
  getDivisionsReports
} = require("../controllers/timekeep")

const timekeepRoutes = express.Router();

timekeepRoutes.get("/read/user/departments_access/:ldapName", getUserDepartmentsAccessList);

// TODO: choose id or name
timekeepRoutes.get("/read/divison/stats/:divisionID/:date", getDvisionTimekeepInfo);

timekeepRoutes.get("/read/user/log/:ldapName/:date", getUserTimekeepLog);

timekeepRoutes.post("/reports", getDivisionsReports);

module.exports = timekeepRoutes;