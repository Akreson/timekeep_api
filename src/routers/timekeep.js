const express = require("express");

const {
  getUserDepartmentsAccessList,
  getDvisionTimekeepInfo,
  getUserTimekeepLog,
  getDivisionsReports
} = require("../controllers/get_timekeep")

const timekeepRoutes = express.Router();

timekeepRoutes.get("/read/user/departments_access/:ldapName", getUserDepartmentsAccessList);

// TODO: choose id or name
timekeepRoutes.get("/read/divison/stats/:divisionID/:date", getDvisionTimekeepInfo);

timekeepRoutes.get("/read/user/log/:ldapName/:date", getUserTimekeepLog);

/*
{
  date: {
    low: date,
    high: date,
    type: web | general | full | fullweb,
    departs: [ids...],
  }
}
*/
timekeepRoutes.post("/reports", getDivisionsReports);

module.exports = timekeepRoutes;