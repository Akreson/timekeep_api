
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
    enter: null,
    exit: null,
    worked: null,
    note: null,
    absentType: [],
  };

  return result;
}

const buildAbsentTabel = absentType => {
  let absentTable = {
    lateIn: absentType[0],  //Опоздание
    notShow: absentType[1], //Прогул
    trip: absentType[2],    //Командировка
    object: absentType[3],  //Объект
    vacation: absentType[4],//Отпуск
    dayOff: absentType[5],  //Отгул
    earlyOut: absentType[6],//Ранний уход
    sick: absentType[7],    //Больничный
  }

  return absentTable;
}

const absentIdToName = (absentTable, absentTypeArr) => {
  let resultStr = null;

  if (absentTypeArr.length > 1) {
    if ((absentTypeArr[0] === absentTable.lateIn.id) &&
      (absentTypeArr[1] === absentTable.earlyOut.id)) {
      resultStr = "опоздание и ранний уход"  
    }
  } else { 
    for (const key in absentTable) {
      const type = absentTable[key];
      
      if (type.id == absentTypeArr[0]) resultStr = type.name;
    }
  }

  return resultStr
}

const initUsersTimekeepLogAggr = (user, checkDate, completeArray, aggregatedUserResult) => {
  // опоздание, прогул, ранний уход
  const isNotTimekeepAbsent = (user.absent_id !== null) &&
  (user.absent_id !== 1) && (user.absent_id !== 2) && (user.absent_id !== 7);
  
  if (DateUtils.areDatePartGt(user.dt_creation, checkDate)) {
    let resultUserObj = getUserResultLogObj();
    resultUserObj.name = user.name;
    resultUserObj.ldapName = user.id_user;
    completeArray.push(resultUserObj);
  } else {
    const startTime = DateUtils.setTimeFromStr(checkDate, user.begin_workday);
    const endTime = DateUtils.setTimeFromStr(checkDate, user.end_workday);
    const setAbsent = isNotTimekeepAbsent ? [user.absent_id] : [];
    
    aggregatedUserResult[user.id_user] = {
      info: {
        name: user.name,
        timeType: user.time_worked_type,
  
        // date obj
        workTime: {
          start: startTime,
          end: endTime,
        }
      },
      log: {
        note: user.comment,
        absentType: setAbsent,

        // millisecond
        firstIn: null,
        lastOut: null
      }
    };
  }
}

const setUserStricTimekeepLogTime = (userLog, log) => {
  const logTime = log.time.getTime();

  // 1 - in, 0 - out
  if (log.direction === 1) {
    if ((userLog.firstIn === null) || (userLog.lastOut === null)) {
      userLog.firstIn = logTime;
    } else {
      if (logTime < userLog.firstIn) userLog.firstIn = logTime
    }
  }
  else if (log.direction === 0) {
    if (userLog.lastOut === null) { //TODO: check if _in_ exist
      userLog.lastOut = logTime;
    } else {
      if (logTime > userLog.lastOut) userLog.lastOut = logTime
    }
  }
}

const setUserNotStricTimekeepLogTime = (userLog, log) => {
  const logTime = log.time.getTime();
  
  if (userLog.firstIn === null) {
    userLog.firstIn = logTime;
  } else if (logTime > userLog.firstIn) {
    userLog.lastOut = logTime
  }
}

const setUserTimekeepLogTime = (timeType, userLog, log) => {
  if (timeType === 1) {
    setUserStricTimekeepLogTime(userLog, log);
  } else if (timeType === 2) {
    setUserNotStricTimekeepLogTime(userLog, log);
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

const setUserEnterResultStats = (userResult, userLog, start, absentTable) => {
  const startTime = start.getTime();
  const enterDate = new Date(userLog.firstIn);
  userResult.enter = DateUtils.getTimePartStr(enterDate);
  
  if (startTime < userLog.firstIn) {
    const timeDiff = -(startTime - userLog.firstIn);
    if (timeDiff > timeToAbsentMillices) {
      userResult.absentType.push(absentTable.notShow.id);
    } else {
      userResult.absentType.push(absentTable.lateIn.id);
    }
  }
}

const setUserExitResultStats = (userResult, userLog, end, absentTable, currentTime, islookAtCurrDate) => {
  const endTime = end.getTime();
  const exitDate = new Date(userLog.lastOut);
  userResult.exit = DateUtils.getTimePartStr(exitDate);

  if (endTime > userLog.lastOut) {
    //if (userLog.lastOut > startTime) {
    if (!islookAtCurrDate || (currentTime > endTime)) {
      userResult.absentType.push(absentTable.earlyOut.id);
    }
    //} else {
    //  userResult.absentType = "Прогул";
    //}
  }
}


const setPresenceUserLogInfo = (logResult, userLog, workTime, absentTable, checkDate, currentDate) => {
  //console.log(logResult);
  
  const currentTime = (new Date()).getTime();
  const islookAtCurrDate = checkDate.getTime() === currentDate.getTime();
  
  if (userLog.firstIn !== null) {
    setUserEnterResultStats(logResult, userLog, workTime.start, absentTable);
  }
  
  if (userLog.lastOut !== null)  {
    setUserExitResultStats(logResult, userLog, workTime.end, absentTable, currentTime, islookAtCurrDate);
  }

  if ((userLog.firstIn !== null) && (userLog.lastOut !== null))  {
    logResult.worked = calcWorkTime(userLog.firstIn, userLog.lastOut);
  } else {
    if ((userLog.firstIn === null) && (userLog.lastOut !== null)) {
      logResult.exit = null; 
    }
    logResult.absentType.push(absentTable.notShow.id);
  }
  
  // (isNotTimekeepAbsent) опоздание, прогул, ранний уход
  if (userLog.absentType.length) {
    logResult.absentType = userLog.absentType;  
  }
  
  if (DateUtils.isDayOff(checkDate)) {
    logResult.absentType = "выходной";
  } else {
    logResult.absentType = absentIdToName(absentTable, logResult.absentType);
  }
}

const aggregateUsersLogStats = (resultArr, aggregatedUser, absentTable, timeRange) => {
  const currentDate = DateUtils.getNowDate();

  for (const key in aggregatedUser) {
    const user = aggregatedUser[key];
    
    let userResult = getUserResultLogObj();
    userResult.ldapName = key;
    userResult.name = user.info.name;
    userResult.note = user.log.note;
    
    setPresenceUserLogInfo(userResult, user.log, user.info.workTime, absentTable, timeRange.low.date, currentDate);
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
  const absentTable = buildAbsentTabel(absentType);
  users.forEach(user => {
    initUsersTimekeepLogAggr(user, timeRange.low.date, result, aggregatedUser);
  })

  // TODO: set day of for all empl if it day of and log is empty
  let timekeepLog = await timekeepLogPendingReq;
  if (!timekeepLog.length) return null;
  
  timekeepLog.forEach(log => {
    let userObj = aggregatedUser[log.id_user];
    setUserTimekeepLogTime(userObj.info.timeType, userObj.log, log);
  });

  aggregateUsersLogStats(result, aggregatedUser, absentTable, timeRange);
  result.sort((a, b) => a.name.localeCompare(b.name));
  //console.log(result);

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
      //dir: controller.dir,
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
  
  const absentTable = buildAbsentTabel(absentType);
  const gatherDeparts = await gatherDepartHierarchy([user.department_id]);
  const departResult = buildResultDepartsHierarchy(gatherDeparts);

  let aggregatedUser = {};
  let userTimekeepResult = [];
  initUsersTimekeepLogAggr(user, timeRange.low.date, userTimekeepResult, aggregatedUser);
  
  let contrLogListResult = [];
  if (timekeepLog.length) {
    let contrKeyIdObj = {};
    let userObj = aggregatedUser[ldapName];
    timekeepLog.forEach(controllerLog => {
      if (contrKeyIdObj[controllerLog.id_controller] === undefined) {
        contrKeyIdObj[controllerLog.id_controller] = 0;
      }
      
      setUserTimekeepLogTime(userObj.info.timeType, userObj.log, controllerLog);
    });
    
    const controllersID = Object.keys(contrKeyIdObj);
    const controllerInfoPendingReq = dbCon.query(sqlQueryList.getControllersMainInfo, [controllersID]);
    
    aggregateUsersLogStats(userTimekeepResult, aggregatedUser, absentTable, timeRange);
    
    const controllerInfo = await controllerInfoPendingReq;
    contrLogListResult = buildControllerLogList(controllerInfo, contrKeyIdObj, timekeepLog);
  } else {
    aggregateUsersLogStats(userTimekeepResult, aggregatedUser, absentTable, timeRange);
  }

  const result = {
    user: userTimekeepResult[0],
    depart: departResult,
    controller: contrLogListResult
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
        log: null
      };
    }

    if (!userResultTable.hasOwnProperty(empl.department_id)) {
      userResultTable[empl.department_id] = {};
    }

    userResultTable[empl.department_id][empl.id_user] = {
      name: empl.name,
      ldapName: empl.id_user,
      timeType: empl.time_worked_type,
      created: empl.dt_creation,
      //resultLength: 0,
      daysResult: []
    };
  })

  return [userLogInfoTable, userResultTable];
}
const getUserLogObj = () => {
  const result = {
    note: null,
    firstIn: null,
    lastOut: null,
    absentType: [],
  };

  return result;
}

const getUserResultLogObjUnnamed = () => {
  let result = {
    enter: null,
    exit: null,
    worked: null,
    note: null,
    absentType: [],
  };

  return result
}

const clearUserInfoLogObj = userLogInfoTable => {
  for (const key in userLogInfoTable) {
    userLogInfoTable[key].log = getUserLogObj();
  }
}

const aggregateUserLogDayInfo = (userLogInfoTable, userResultTable, absentTable, checkDate) => {
  const currentDate = DateUtils.getNowDate();
  const currentTime = (new Date()).getTime();
  const islookAtCurrDate = checkDate.getTime() === currentDate.getTime();
  const dateCustomStr = DateUtils.getDatePartStrCustom(checkDate);

  for (const userID in userLogInfoTable) {
    const userLog = userLogInfoTable[userID];
    const user = userResultTable[userLog.departID][userID];

    let logResult = getUserResultLogObjUnnamed();
    logResult.note = userLog.log.note;

    let userDayResult = {
      day: dateCustomStr,
      log: null
    };
    
    if (!DateUtils.areDatePartGt(user.created, checkDate)) {
      
      const workTime = {
        start: DateUtils.setTimeFromArr(checkDate, userLog.startTime),
        end: DateUtils.setTimeFromArr(checkDate, userLog.endTime)
      };
      
      setPresenceUserLogInfo(logResult, userLog.log, workTime, absentTable, checkDate, currentDate);
      userDayResult.log = logResult;
    }

    user.daysResult.push(userDayResult);
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
  const absentTable = buildAbsentTabel(absentType);
  let [userLogInfoTable, userResultTable] = initUserInfoLookUpTabels(employees);
  const timekeepLog = await timekeepLogPendignReq;
  
 // console.log(timekeepLog);

 console.time('A');

 let absentLogIndex = 0;
 let timekeepLogIndex = 0;
 let checkDate = lowDate;
 let blockingSince = Date.now()
 
  while (!DateUtils.areDatePartGt(checkDate, highDate)) {
    clearUserInfoLogObj(userLogInfoTable);
    
    for (; absentLogIndex < absentLog.length; absentLogIndex++) {
      const absentElem = absentLog[absentLogIndex];

      if (!DateUtils.areDatePartEq(checkDate, absentElem.date)) break;

      let userLogInfo = userLogInfoTable[absentElem.employee_id];
      userLogInfo.log.absentType.push(absentElem.absent_id);
      userLogInfo.log.note = absentElem.comment.length ? absentElem.comment : null;
    }

    for (; timekeepLogIndex < timekeepLog.length; timekeepLogIndex++) {
      const timekeepElem = timekeepLog[timekeepLogIndex];
      
      if (!DateUtils.areDatePartEq(checkDate, timekeepElem.time)) break;

      const userID = timekeepElem.id_user;
      let userLogInfo = userLogInfoTable[userID];
      const userWorkType = userResultTable[userLogInfo.departID][userID].timeType;

      setUserTimekeepLogTime(userWorkType, userLogInfo.log, timekeepElem);
    }

    aggregateUserLogDayInfo(userLogInfoTable, userResultTable, absentTable, checkDate);

    checkDate = DateUtils.addDay(checkDate);
    
    if (blockingSince + 150 > Date.now()) {
      await setImmediatePromise();
      blockingSince = Date.now();
    }
  }
  console.log(JSON.stringify(userResultTable, null, 3));

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
