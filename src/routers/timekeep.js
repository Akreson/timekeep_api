const express = require("express");

const {
  getUserDepartmentsAccessList,
  getDvisionTimekeepInfo
} = require("../controllers/timekeep")

const timekeepRoutes = express.Router();

timekeepRoutes.get("/read/user/departments/:ldapName", getUserDepartmentsAccessList);

// TODO: choose id or name
timekeepRoutes.get("/read/divison/stats/:divisionID/:date", getDvisionTimekeepInfo);

module.exports = timekeepRoutes;