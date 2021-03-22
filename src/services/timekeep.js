
const mysql2 = require("mysql2");
const DbConnection = require("../utils/db");
const DateUtils = require("../utils/date");

const { dbConnectionParams } = require("../configs/info.js");
const { sqlQueryList } = require("../options/timekeep");

const {
  setImmediatePromise,
  setTimeoutPromise,
} = require("../utils/shared");

const timeToAbsentMillices = 2 * DateUtils.hoursToMillisec;
const dbCon = new DbConnection(dbConnectionParams);

const sortDepartByName = departsArray => {
  departsArray.sort((a, b) => a.name.localeCompare(b.name));

  departsArray.forEach(item => {
    if (item.child.length > 1) {
      sortDepartByName(item.child);
    }
  });
}

const buildResultDepartsHierarchy = gatheredDepartInfo => {
  let result = [];

  // создаем дерево департаментов основываясь на parentID
  for (const key in gatheredDepartInfo) {
    const current = gatheredDepartInfo[key];

    const objToPush = {
      id: Number(key),
      name: current.name,
      child: current.child
    }

    if (current.parentID !== null) {
      const parent = gatheredDepartInfo[current.parentID];
      parent.child.push(objToPush);
    } else {
      result.push(objToPush);
    }
  }

  sortDepartByName(result);
  return result;
}

const gatherDepartHierarchy = async initUserDepart => {
  let resultGatherDeparts = {};
  let departIDToReq = initUserDepart
  
  // проверяем parent_id которые отсутствуют и запрашиваем их
  while (true) {
    const departReqResult = await dbCon.query(sqlQueryList.getDepartsInfo, [departIDToReq]);
  
    let absentParent = {};

    departReqResult.forEach(item => {
      if ((item.parent_id !== null) && (absentParent[item.parent_id] === undefined)) {
        absentParent[item.parent_id] = 1;
      }

      if (resultGatherDeparts[item.id] === undefined) {
        resultGatherDeparts[item.id] = {
          name: item.name,
          parentID: item.parent_id,
          child: []
        };
      }
    });
    
    const parentIdToReq = Object.keys(absentParent).map(item => Number(item));
    
    departIDToReq = parentIdToReq.filter(parentID => {
      return resultGatherDeparts[parentID] === undefined;
    });
    
    if (!departIDToReq.length) break;
  }

  return resultGatherDeparts;
}

exports.processGetUserDepartAccessList = async ldapName => {
  const userIDResult = await dbCon.query(sqlQueryList.getUserIDFromUserLDAP, [ldapName]);

  if (!userIDResult.length) return null;
  const userID = userIDResult[0].id;
  
  const userAllowDepart = await dbCon.query(sqlQueryList.getUserAllowedDeparts, [userID]);
  if (!userAllowDepart.length) return null;
  
  const allowDepartsIDs = userAllowDepart.map(item => item.department_id);
  const gatherDeparts = await gatherDepartHierarchy(allowDepartsIDs);
  const result = buildResultDepartsHierarchy(gatherDeparts);

  return result;
}

const getUserResultLogObj = () => {
  let result = {
    name: null,
    ldapName: null,
    absentType: null,
    enter: null,
    exit: null,
    worked: null,
    note: null,
  };

  return result;
}

const initUsersTimekeepLogAggr = (user, checkDate, absentTypeArr, completeArray, aggregatedUserResult) => {
  let resultUserObj = getUserResultLogObj();

  // опоздание, прогул, ранний уход
  const isNotTimekeepAbsent = (user.absent_id !== null) &&
    (user.absent_id !== 1) && (user.absent_id !== 2) && (user.absent_id !== 7);

  if (DateUtils.areDatePartGt(user.dt_creation, checkDate)) {
    resultUserObj.name = user.name;
    resultUserObj.ldapName = user.id_user;
    completeArray.push(resultUserObj);
  } else {
    const startTime = DateUtils.setTimeFromStr(checkDate, user.begin_workday);
    const endTime = DateUtils.setTimeFromStr(checkDate, user.end_workday);
    let setAbsent = isNotTimekeepAbsent ? absentTypeArr[user.absent_id - 1].name : null;
    setAbsent = DateUtils.isDayOff(checkDate) ? "выходной" : setAbsent;
    
    aggregatedUserResult[user.id_user] = {
      name: user.name,
      timeType: user.time_worked_type,
 
      // date obj
      start: startTime,
      end: endTime,
 
      comment: user.comment,
      absentType: setAbsent,
      // millisecond
      firstIn: null,
      lastOut: null
    };
  }
}

const setUserStricTimekeepLogTime = (userObj, log) => {
  const logTime = log.time.getTime();

  // 1 - in, 0 - out
  if (log.direction === 1) {
    if ((userObj.firstIn === null) || (userObj.lastOut === null)) {
      userObj.firstIn = logTime;
    } else {
      if (logTime < userObj.firstIn) userObj.firstIn = logTime
    }
  }
  else if (log.direction === 0) {
    if (userObj.lastOut === null) { //TODO: check if _in_ exist
      userObj.lastOut = logTime;
    } else {
      if (logTime > userObj.lastOut) userObj.lastOut = logTime
    }
  }
}

const setUserNotStricTimekeepLogTime = (userObj, log) => {
  const logTime = log.time.getTime();
  
  if (userObj.firstIn === null) {
    userObj.firstIn = logTime;
  } else if (logTime > userObj.firstIn) {
    userObj.lastOut = logTime
  }
}

const setUserTimekeepLogTime = (timeType, userLogObj, log) => {
  if (timeType === 1) {
    setUserStricTimekeepLogTime(userLogObj, log);
  } else if (timeType === 2) {
    setUserNotStricTimekeepLogTime(userLogObj, log);
  }
}

// TODO: return string, date or millisec?
const calcWorkTime = (start, end) => {
  const startDate = new Date(start);
  const endDate = new Date(end);

  let diff = end - start;
  let subTime = 0;

  const startHours = startDate.getHours();
  const endHours = endDate.getHours();
  if ((endHours >= 13) && (startHours <= 12)) {
    subTime = 1 * DateUtils.hoursToMillisec;
  } else if (endHours == 12) {
    subTime = endDate.getMinutes() * DateUtils.minutesToMillisec;
  }

  diff -= subTime;
  const resultDate = new Date(diff);
  const timeStr = DateUtils.getUTCTimePartStr(resultDate);
  
  return timeStr;
}

const setUserEnterResultStats = (userResult, userLog) => {
  const startTime = userLog.start.getTime();
  const enterDate = new Date(userLog.firstIn);
  userResult.enter = DateUtils.getTimePartStr(enterDate);
  
  if (startTime < userLog.firstIn) {
    const timeDiff = -(startTime - userLog.firstIn);
    if (timeDiff > timeToAbsentMillices) {
      userResult.absentType = "Прогул";
    } else {
      userResult.absentType = "Опоздание";
    }
  }
}

const setUserExitResultStats = (userResult, userLog, islookAtCurrDate) => {
  const endTime = userLog.end.getTime();
  const exitDate = new Date(userLog.lastOut);
  userResult.exit = DateUtils.getTimePartStr(exitDate);

  if (endTime > userLog.lastOut) {
    //if (userLog.lastOut > startTime) {
      if (!islookAtCurrDate || (currentTime > endTime)) {
        if (userResult.absentType === "Опоздание") {
          userResult.absentType = "Опоздание и ранний уход";
        } else {
          userResult.absentType = "Ранний уход";
        }
      }
    //} else {
    //  userResult.absentType = "Прогул";
    //}
  }
}

const aggregateUsersLogStats = (resultArr, aggregatedUser, timeRange) => {
  const currentDate = DateUtils.getNowDate();
  const currentTime = (new Date()).getTime();
  const islookAtCurrDate = timeRange.low.date.getTime() === currentDate.getTime();
  
  for (const key in aggregatedUser) {
    const userLog = aggregatedUser[key];
    
    let userResult = getUserResultLogObj();
    userResult.name = userLog.name;
    userResult.ldapName = key;
    
    if (userLog.firstIn !== null) {
      setUserEnterResultStats(userResult, userLog);
    }
    
    if (userLog.lastOut !== null)  {
      setUserExitResultStats(userResult, userLog, islookAtCurrDate);
    }

    if ((userLog.firstIn !== null) && (userLog.lastOut !== null))  {
      userResult.worked = calcWorkTime(userLog.firstIn, userLog.lastOut);
    } else {
      if ((userLog.firstIn === null) && (userLog.lastOut !== null)) {
        userResult.exit = null; 
      }
      userResult.absentType = "Прогул";
    }
    
    if (userLog.absentType !== null) {
      userResult.absentType = userLog.absentType;  
    }

    userResult.note = userLog.comment;
    resultArr.push(userResult);
  }
}

exports.processGetDivisionTimekeepStat = async (divisionID, date) => {
  let result = [];
  const timeRange = DateUtils.getTimeRangeForDate(date);
  
  let pendingReq = [];
  pendingReq.push(dbCon.query(sqlQueryList.getAbsentType));
  pendingReq.push(dbCon.query(
    sqlQueryList.getEmployeesDivisionInfoWithAbsent, [timeRange.low.str, timeRange.high.str, divisionID]));

  const [absentType, users] = await Promise.all(pendingReq);
  if (!users.length) return null;
  
  const timekeepLogPendingReq = dbCon.query(
    sqlQueryList.getDivisionsTimekeepLog, [[divisionID], timeRange.low.str, timeRange.high.str]);
  
  let aggregatedUser = {};
  users.forEach(user => {
    initUsersTimekeepLogAggr(user, timeRange.low.date, absentType, result, aggregatedUser);
  })

  // TODO: set day of for all empl if it day of and log is empty
  let timekeepLog = await timekeepLogPendingReq;
  if (!timekeepLog.length) return null;
  
  timekeepLog.forEach(log => {
    let userObj = aggregatedUser[log.id_user];

    if (userObj.timeType === 1) {
      setUserStricTimekeepLogTime(userObj, log);
    } else if (userObj.timeType === 2) {
      setUserNotStricTimekeepLogTime(userObj, log);
    }
  });

  aggregateUsersLogStats(result, aggregatedUser, timeRange);
  result.sort((a, b) => a.name.localeCompare(b.name));
  console.log(result);

  return result;
}

const buildControllerLogList = (controllerInfo, contrIdToName, timekeepLog) => {
  let result = [];

  //timekeepLog.sort((a, b) => a.time.getTime() - b.time.getTime());
  controllerInfo.forEach(controller => {
    contrIdToName[controller.id_controller] = {
      name: controller.name,
      timekeep: controller.use_timekeeping,
      dir: controller.direction
    };
  });

  timekeepLog.forEach(log => {
    const controller = contrIdToName[log.id_controller];
    const contrLogObj = {
      time: DateUtils.getTimePartStr(log.time),
      dir: controller.dir,
      name: controller.name,
      timekeep: controller.timekeep,
    };

    result.push(contrLogObj);
  });

  return result;
}

exports.processGetUserTimekeepLog = async (ldapName, date) => {
  const timeRange = DateUtils.getTimeRangeForDate(date);

  let pendingReg = [];
  const pendingRegParams = [timeRange.low.str, timeRange.high.str, ldapName];
  pendingReg.push(dbCon.query(sqlQueryList.getUserInfoWithAbsent, pendingRegParams));
  pendingReg.push(dbCon.query(sqlQueryList.getUserTimekeepLog, pendingRegParams));
  pendingReg.push(dbCon.query(sqlQueryList.getAbsentType));

  const [userInfo, timekeepLog, absentType] = await Promise.all(pendingReg);
  if (!userInfo.length) return null;
  
  const user = userInfo[0];
  user.id_user = ldapName;

  const gatherDeparts = await gatherDepartHierarchy([user.department_id]);
  const departResult = buildResultDepartsHierarchy(gatherDeparts);

  let aggregatedUser = {};
  let userTimekeepResult = [];
  initUsersTimekeepLogAggr(user, timeRange.low.date, absentType, userTimekeepResult, aggregatedUser);
  
  let contrLogListResult = [];
  if (timekeepLog.length) {
    let contrKeyIdObj = {};
    let userLogObj = aggregatedUser[ldapName];
    timekeepLog.forEach(controllerLog => {
      if (contrKeyIdObj[controllerLog.id_controller] === undefined) {
        contrKeyIdObj[controllerLog.id_controller] = 0;
      }
      
      if (userLogObj.timeType === 1) {
        setUserStricTimekeepLogTime(userLogObj, controllerLog);
      } else if (userLogObj.timeType === 2) {
        setUserNotStricTimekeepLogTime(userLogObj, controllerLog);
      }
    });
    
    const controllersID = Object.keys(contrKeyIdObj);
    const controllerInfoPendingReq = dbCon.query(sqlQueryList.getControllersMainInfo, [controllersID]);
    
    aggregateUsersLogStats(userTimekeepResult, aggregatedUser, timeRange);
    
    const controllerInfo = await controllerInfoPendingReq;
    contrLogListResult = buildControllerLogList(controllerInfo, contrKeyIdObj, timekeepLog);
  } else {
    aggregateUsersLogStats(userTimekeepResult, aggregatedUser, timeRange);
  }

  const result = {
    user: userTimekeepResult[0],
    depart: departResult,
    controller: contrLogListResult
  };

  return result;
}

const getUserLogObj = () => {
  const result = {
    note: null,
    firstIn: null,
    lastOut: null,
    absentType: null,
  };

  return result;
}

const initUserInfoLookUpTabels = employees => {
  let userLogInfoTable = {};
  let userResultTable = {};

  employees.forEach(empl => {
    if (!userLogInfoTable.hasOwnProperty(empl.id_user)) {
      userLogInfoTable[empl.id_user] = {
        departID: empl.department_id,
        startTime: DateUtils.getTimeArrFromStr(empl.begin_workday),
        endTime: DateUtils.getTimeArrFromStr(empl.end_workday),
        logObj: null
      }
    }

    if (!userResultTable.hasOwnProperty(empl.department_id)) {
      userResultTable[empl.department_id] = {};
    }

    userResultTable[empl.department_id][empl.id_user] = {
      name: empl.name,
      timeType: empl.time_worked_type,
      daysResult: []
    }
  })

  return [userLogInfoTable, userResultTable];
}

const clearUserInfoLogObj = userLogInfoTable => {
  const emptyUserLogObj = getUserLogObj();
  for (const key in userLogInfoTable) {
    userLogInfoTable[key].logObj = emptyUserLogObj;
  }
}

exports.processGetDivisionsReports = async (departs, type, lowDate, highDate) => {
  const lowDateStr = DateUtils.getDatePartStr(lowDate);
  const highDateStr = DateUtils.getDatePartStr(highDate);
  const pendingReqParams = [departs, lowDateStr, highDateStr];

  let pendingReq = [];
  pendingReq.push(dbCon.query(sqlQueryList.getAbsentType));
  pendingReq.push(dbCon.query(sqlQueryList.getMultipleDivisionEmployees, departs));
  pendingReq.push(dbCon.query(sqlQueryList.getDivisionsAbsentLog, pendingReqParams));

  const timekeepLogPendignReq = dbCon.query(sqlQueryList.getDivisionsTimekeepLog, pendingReqParams);
  const [absentType, employees, absentLog] = await Promise.all(pendingReq);
  
  //console.log(absentLog.length);

  let [userLogInfoTable, userResultTable] = initUserInfoLookUpTabels(employees);
  const timekeepLog = await timekeepLogPendignReq;
  
 // console.log(timekeepLog);

  let blockingSince = Date.now() // TODO: add setImmidiatePromise() on 100ms
  let checkDate = lowDate;
  let AbsentLogIndex = 0;
  let TimekeepLogIndex = 0;
  while (!DateUtils.areDatePartGt(checkDate, highDate)) {
    clearUserInfoLogObj(userLogInfoTable);
    
    console.log('absentlog ', checkDate);
    for (; AbsentLogIndex < absentLog.length; AbsentLogIndex++) {
      const absentElem = absentLog[AbsentLogIndex];

      if (!DateUtils.areDatePartEq(checkDate, absentElem.date)) {
        //if (i !== AbsentLogIndex) AbsentLogIndex = i;
        break;
      }
      console.log(AbsentLogIndex, absentLog[AbsentLogIndex]);

      let userLogInfo = userLogInfoTable[absentElem.employee_id];
      userLogInfo.absentType = absentElem.absent_id;
      userLogInfo.note = absentElem.comment.length ? absentElem.comment : null;
    }

    // TODO: fix earle in
    console.log('timelog ', checkDate);
    for (; TimekeepLogIndex < timekeepLog.length; TimekeepLogIndex++) {
      const timekeepElem = timekeepLog[TimekeepLogIndex];

      if (!DateUtils.areDatePartEq(checkDate, timekeepElem.time)) {
        //if (i !== TimekeepLogIndex) TimekeepLogIndex = i;
        break; 
      }

      const userID = timekeepElem.id_user;
      let userLogInfo = userLogInfoTable[userID];
      const userWorkType = userResultTable[userLogInfo.departID][userID].timeType;
      setUserTimekeepLogTime(userWorkType, userLogInfo.logObj, timekeepElem);
      console.log(TimekeepLogIndex, timekeepElem);
    }

    // console.log(JSON.stringify(userLogInfoTable, null, 3));
    // break;

    checkDate = DateUtils.addDay(checkDate);

    if (blockingSince + 150 > Date.now) {
      await setImmediatePromise();
      blockingSince = Date.now();
    }
  }

  // const used = process.memoryUsage().heapUsed / 1024 / 1024;
  // console.log(`Used memory: ${used}`);

  return "Ok";
}

/*
  console.time('t');

  let p = [];
  p.push(dbCon.query(sqlQueryList.sleep1Sec));
  p.push(dbCon.query(sqlQueryList.sleep1Sec));
  p.push(dbCon.query(sqlQueryList.sleep1Sec));
  console.log(p);

  const r = await Promise.all(p);
  console.log(r[0], r[1], r[2]);

  console.timeEnd('t');

  return "ok";
*/
