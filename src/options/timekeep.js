exports.sqlQueryList = {
    sleep1Sec: "SELECT SLEEP(1);",

    getUserIDFromUserLDAP: "SELECT `id` FROM `Users` WHERE `username_ldap` = ?",

    getUserAllowedDeparts: "SELECT `department_id` FROM `UsersDepartments` WHERE `user_id` = ?",

    getDepartsInfo: "SELECT `id`, `is_department`, `parent_id`, `name` FROM `Departments` WHERE `id` IN (?)",
    
    getAbsentType: "SELECT * FROM timekeeping.Absent;",

    getAllDeparts: "SELECT * FROM `Departments`",

    // нужно передавать время в формате DATE
    getEmployeesDivisionInfoWithAbsent: `
      SELECT 
        id_user, 
        name, 
        CONVERT(begin_workday, TIME) as begin_workday,
        CONVERT(end_workday, TIME) as end_workday,
        time_worked_type,
        dt_creation,
        AbsentLog.absent_id,
        AbsentLog.comment
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

    getMultipleDivisionEmployees: `
      SELECT 
        id_user, 
        name, 
        CONVERT(begin_workday, TIME) as begin_workday,
        CONVERT(end_workday, TIME) as end_workday,
        time_worked_type,
        dt_creation,
        department_id
      FROM 
        Employees
      WHERE 
        Employees.deleted = 0
        AND
        Employees.department_id IN(?);`,

    // нужно передавать время в формате DATE
    getDivisionsTimekeepLog: `
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
        Employees.department_id IN(?)
      WHERE 
        DATE(ControllersLog.dt_event) between DATE(?) and DATE(?)
      ORDER BY time;`,
    
    getUserTimekeepLog: `
      SELECT
        ControllersLog.direction,
        ControllersLog.id_controller,
        ControllersLog.dt_event as time,
        Controllers.use_timekeeping as timekeep
      FROM 
        ControllersLog
      INNER JOIN Controllers ON
        Controllers.id_controller = ControllersLog.id_controller
      WHERE 
        DATE(dt_event) between DATE(?) and DATE(?)
      AND
        id_user = ?;`,
      
    getControllersMainInfo: `
      SELECT
        id_controller,
        use_timekeeping,
        direction,
        name
      FROM
        Controllers
      WHERE
        id_controller IN(?);`,
    
    getUserInfoWithAbsent: `
      SELECT 
        name,
        CONVERT(begin_workday, TIME) as begin_workday,
        CONVERT(end_workday, TIME) as end_workday,
        time_worked_type,
        department_id,
        dt_creation,
        AbsentLog.absent_id
      FROM 
        Employees
      LEFT JOIN AbsentLog ON
        AbsentLog.employee_id = Employees.id_user
        AND
        DATE(AbsentLog.date) between DATE(?) and DATE(?)
      WHERE 
        Employees.id_user = ?;`,
    
    getDivisionsAbsentLog: `
      SELECT
        employee_id,
        absent_id,
        date,
        comment
      FROM
        AbsentLog
      INNER JOIN Employees ON
        Employees.id_user = AbsentLog.employee_id
        AND
        Employees.deleted = 0
        AND
        Employees.department_id IN(?)
      WHERE 
        date between DATE(?) and DATE(?)
      ORDER BY date;`,
};
