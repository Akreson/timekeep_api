exports.sqlQueryList = {
    getUserIDFromUserLDAP: "SELECT `id` FROM `Users` WHERE `username_ldap` = ?",

    getUserAllowedDeparts: "SELECT `department_id` FROM `UsersDepartments` WHERE `user_id` = ?",

    getDepartsInfo: "SELECT `id`, `is_department`, `parent_id`, `name` FROM `Departments` WHERE `id` IN (?)",

    // нужно передавать время в формате DATE
    getEmployeesDivisionInfo: `
      SELECT 
        id_user, 
        name, 
        CONVERT(begin_workday, TIME) as begin_workday,
        CONVERT(end_workday, TIME) as end_workday,
        time_worked_type,
        AbsentLog.absent_id
      FROM 
        Employees
      LEFT JOIN AbsentLog ON
        AbsentLog.employee_id = Employees.id_user
        AND
        DATE(AbsentLog.date) between DATE(?) and DATE(?)
      WHERE 
        Employees.deleted = 0
        AND
        Employees.department_id = ?;`,

    getAbsentType: "SELECT * FROM timekeeping.Absent;",

    // нужно передавать время в формате DATE
    getDivisionTimekeepLog: `
      SELECT
        ControllersLog.direction,
        ControllersLog.dt_event as time,
        ControllersLog.id_user
      FROM 
        ControllersLog
      INNER JOIN Controllers ON
        Controllers.use_timekeeping = 1
        AND 
        ControllersLog.id_controller = Controllers.id_controller
      INNER JOIN Employees ON
        Employees.id_user = ControllersLog.id_user
        AND
        Employees.deleted = 0
        AND
        Employees.department_id = ?
      WHERE 
        DATE(ControllersLog.dt_event) between DATE(?) and DATE(?)
      ORDER BY time;`,
};
