const express = require("express");

const {
  getUserDepartmentsAccessList,
  getAllDepartsWithUserMarks,
  getDvisionTimekeepInfo,
  getUserTimekeepLog,
  getDivisionsReports
} = require("../controllers/get_timekeep");

const {
  
} = require("../controllers/set_timekeep");

const timekeepRoutes = express.Router();

timekeepRoutes.get("/read/user/departs/access/:ldapName", getUserDepartmentsAccessList);

timekeepRoutes.get("/read/user/departs/marks/:ldapName", getAllDepartsWithUserMarks);

// TODO: choose id or name
timekeepRoutes.get("/read/divison/stats/:divisionID/:date", getDvisionTimekeepInfo);

timekeepRoutes.get("/read/user/log/:ldapName/:date", getUserTimekeepLog);

/*
{
  date: {
    low: date,
    high: date,
    type: web | general | full | fullweb,
    onlyType: type_str
    departs: [ids...],
  }
}
*/
timekeepRoutes.post("/reports", getDivisionsReports);

module.exports = timekeepRoutes;