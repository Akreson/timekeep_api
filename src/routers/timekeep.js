const express = require("express");

const {
  getUserDepartmentsAccessList,
  getDvisionTimekeepInfo,
  getUserTimekeepLog
} = require("../controllers/timekeep")

const timekeepRoutes = express.Router();

timekeepRoutes.get("/read/user/departments_access/:ldapName", getUserDepartmentsAccessList);

// TODO: choose id or name
timekeepRoutes.get("/read/divison/stats/:divisionID/:date", getDvisionTimekeepInfo);

timekeepRoutes.get("/read/user/log/:ldapName/:date", getUserTimekeepLog);

module.exports = timekeepRoutes;