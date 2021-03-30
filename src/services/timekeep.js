
const mysql2 = require("mysql2");
const DbConnection = require("../utils/db");
const DateUtils = require("../utils/date");

const { dbConnectionParams } = require("../configs/info.js");
const { sqlQueryList } = require("../options/timekeep");

const {
  setImmediatePromise,
  setTimeoutPromise,
  initArray,
  cloneObj
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

const setDefaultDepartTreeObj = (id, obj) => {
  const result = {
    id: Number(id),
    name: obj.name,
    child: obj.child
  };

  return result;
}

const buildResultDepartsHierarchy = (gatheredDepartInfo, setObjFunc) => {
  let result = [];

  if (setObjFunc === undefined)
    setObjFunc = setDefaultDepartTreeObj;

  // создаем дерево департаментов основываясь на parentID
  for (const key in gatheredDepartInfo) {
    const current = gatheredDepartInfo[key];

    const objToPush = setObjFunc(key, current);

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
    userID: null,
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

    idToNameMap: []
  };
  console.log(absentTable);

  absentTable.idToNameMap = absentType.map(item => item.name);

  return absentTable;
}

const absentIdToName = (absentTable, absentTypeArr) => {
  let resultStr = null;

  if (absentTypeArr.length > 1) {
    if ((absentTypeArr[0] === absentTable.lateIn.id) &&
      (absentTypeArr[1] === absentTable.earlyOut.id)) {
      resultStr = "опоздание и ранний уход"  
    }
  } else if (absentTypeArr.length === 1) { 
    resultStr = absentTable.idToNameMap[absentTypeArr[0] - 1];
  }

  return resultStr
}

const setAbsentTypeArrToStr = (absentTable, absentTypeArr, checkDate) => {
  let result = null;

  if (DateUtils.isDayOff(checkDate)) {
    result = "выходной";
  } else {
    result = absentIdToName(absentTable, absentTypeArr);
  }

  return result;
}

const absentStatsToDict = (absentTable, statsArr) => {
  let result = {};

  statsArr.forEach((value, index) => {
    result[absentTable.idToNameMap[index]] = value;
  });

  return result;
}

const initUsersTimekeepLogAggr = (user, checkDate, completeArray, aggregatedUserResult) => {  
  if (DateUtils.areDatePartGt(user.dt_creation, checkDate)) {
    let resultUserObj = getUserResultLogObj();
    resultUserObj.name = user.name;
    resultUserObj.userID = user.id_user;
    resultUserObj.absentType = null;
    completeArray.push(resultUserObj);
  } else {
    const startTime = DateUtils.setTimeFromStr(checkDate, user.begin_workday);
    const endTime = DateUtils.setTimeFromStr(checkDate, user.end_workday);

    // опоздание, прогул, ранний уход
    const isNotTimekeepAbsent = (user.absent_id !== null) &&
      (user.absent_id !== 1) && (user.absent_id !== 2) && (user.absent_id !== 7);

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

// NOTE: логи должны обрабатываться в сортированом по временни порядке
const setUserStricTimekeepLogTime = (userLog, log) => {
  const logTime = log.time.getTime();

  // 1 - in, 0 - out
  if (log.direction === 1) {
    if (userLog.lastOut === null) {
      userLog.firstIn = logTime;
    } else if ((userLog.firstIn === null) && (userLog.lastOut < logTime)) {
      userLog.lastOut = null;
      userLog.firstIn = logTime;
    }
  }
  else if (log.direction === 0) {
    if (userLog.lastOut === null) {
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
  } else if (logTime >= userLog.firstIn) {
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
  
  if (userLog.firstIn >= startTime) {
    //const timeDiff = -(startTime - userLog.firstIn);
    // if (timeDiff > timeToAbsentMillices) {
    //   userResult.absentType.push(absentTable.notShow.id);
    // } else {
      userResult.absentType.push(absentTable.lateIn.id);
    //}
  }
}

const setUserExitResultStats = (userResult, userLog, end, absentTable, currentTime, islookAtCurrDate) => {
  const endTime = end.getTime();
  const exitDate = new Date(userLog.lastOut);
  userResult.exit = DateUtils.getTimePartStr(exitDate);

  if (userLog.lastOut < endTime) {
    //if (userLog.lastOut > startTime) {
    if (!islookAtCurrDate || (currentTime > endTime)) {
      userResult.absentType.push(absentTable.earlyOut.id);
    }
    //} else {
    //  userResult.absentType = "Прогул";
    //}
  }
}

//27.05.2019 1924
const setPresenceUserLogInfo = (logResult, userLog, workTime, absentTable, checkDate, currentDate) => {
  const currentTime = (new Date()).getTime();
  const islookAtCurrDate = checkDate.getTime() === currentDate.getTime();
  
  if (userLog.firstIn !== null) {
    setUserEnterResultStats(logResult, userLog, workTime.start, absentTable);
  }
  
  if (userLog.lastOut !== null)  {
    setUserExitResultStats(logResult, userLog, workTime.end, absentTable, currentTime, islookAtCurrDate);
  }

  if ((userLog.firstIn !== null) && (userLog.lastOut !== null)) {
    // if (userLog.lastOut < userLog.firstIn) {
    //   logResult.absentType = [];
    //   logResult.absentType.push(absentTable.notShow.id);
    //   userLog.exit = null;
    // }
    // else
    {
      logResult.worked = calcWorkTime(userLog.firstIn, userLog.lastOut);
    }
  } else {
    if ((userLog.firstIn === null) && (userLog.lastOut !== null)) {
      logResult.exit = null; 
    }
    logResult.absentType = [];
    logResult.absentType.push(absentTable.notShow.id);
  }

  if (DateUtils.isDayOff(checkDate)) {
    logResult.absentType = [];
  }

  // (isNotTimekeepAbsent) опоздание, прогул, ранний уход
  if (userLog.absentType.length) {
    logResult.absentType = userLog.absentType;  
  }
}

const aggregateUsersLogStats = (resultArr, aggregatedUser, absentTable, timeRange) => {
  const currentDate = DateUtils.getNowDate();

  for (const key in aggregatedUser) {
    const user = aggregatedUser[key];
    
    let userResult = getUserResultLogObj();
    userResult.userID = key;
    userResult.name = user.info.name;
    userResult.note = user.log.note;
    
    setPresenceUserLogInfo(userResult, user.log, user.info.workTime, absentTable, timeRange.low.date, currentDate);
    userResult.absentType = setAbsentTypeArrToStr(absentTable, userResult.absentType, timeRange.low.date);
    
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
  console.log(timekeepLog);
  
  timekeepLog.forEach(log => {
    let userObj = aggregatedUser[log.id_user];
    setUserTimekeepLogTime(userObj.info.timeType, userObj.log, log);
  });

  aggregateUsersLogStats(result, aggregatedUser, absentTable, timeRange);
  result.sort((a, b) => a.name.localeCompare(b.name));

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

exports.processGetUserTimekeepLog = async (userID, date) => {
  const timeRange = DateUtils.getTimeRangeForDate(date);

  let pendingReg = [];
  const pendingRegParams = [timeRange.low.str, timeRange.high.str, userID];
  pendingReg.push(dbCon.query(sqlQueryList.getUserInfoWithAbsent, pendingRegParams));
  pendingReg.push(dbCon.query(sqlQueryList.getUserTimekeepLog, pendingRegParams));
  pendingReg.push(dbCon.query(sqlQueryList.getAbsentType));

  const [userInfo, timekeepLog, absentType] = await Promise.all(pendingReg);
  if (!userInfo.length) return null;

  console.log(timekeepLog);
  
  const user = userInfo[0];
  user.id_user = userID;
  
  const absentTable = buildAbsentTabel(absentType);
  const gatherDeparts = await gatherDepartHierarchy([user.department_id]);
  const departResult = buildResultDepartsHierarchy(gatherDeparts);

  let aggregatedUser = {};
  let userTimekeepResult = [];
  initUsersTimekeepLogAggr(user, timeRange.low.date, userTimekeepResult, aggregatedUser);
  
  let contrLogListResult = [];
  if (timekeepLog.length) {
    let contrKeyIdObj = {};
    let userObj = aggregatedUser[userID];
    timekeepLog.forEach(controllerLog => {
      if (contrKeyIdObj[controllerLog.id_controller] === undefined) {
        contrKeyIdObj[controllerLog.id_controller] = 0;
      }

      if (controllerLog.timekeep) {
        setUserTimekeepLogTime(userObj.info.timeType, userObj.log, controllerLog);
      }
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

const initUserInfoLookUpTabels = (employees, absentTypesCount) => {
  let userTables = {
    LogInfo: {},
    Result: {}
  };

  employees.forEach(empl => {
    if (!userTables.LogInfo.hasOwnProperty(empl.id_user)) {
      userTables.LogInfo[empl.id_user] = {
        departID: empl.department_id,
        startTime: DateUtils.getTimeArrFromStr(empl.begin_workday),
        endTime: DateUtils.getTimeArrFromStr(empl.end_workday),
        log: null
      };
    }

    if (!userTables.Result.hasOwnProperty(empl.department_id)) {
      userTables.Result[empl.department_id] = {
        absentStat: initArray(absentTypesCount, 0),
        user: {}
      };
    }

    userTables.Result[empl.department_id].user[empl.id_user] = {
      name: empl.name,
      userID: empl.id_user,
      timeType: empl.time_worked_type,
      created: empl.dt_creation,
      absentStat: initArray(absentTypesCount, 0),
      daysLog: []
    };
  })

  return userTables;
}

const clearUserInfoLogObj = userLogInfoTable => {
  for (const key in userLogInfoTable) {
    userLogInfoTable[key].log = getUserLogObj();
  }
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

let COUNTER = 0;

const aggregateUserLogDayInfo = (userTables, absentTable, checkDate) => {
  const currentDate = DateUtils.getNowDate();
  const currentTime = (new Date()).getTime();
  const islookAtCurrDate = checkDate.getTime() === currentDate.getTime();
  const dateCustomStr = DateUtils.getDatePartStrCustom(checkDate);

  for (const userID in userTables.LogInfo) {
    const userLog = userTables.LogInfo[userID];
    let depart = userTables.Result[userLog.departID];
    let user = depart.user[userID];

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

      if (logResult.absentType.length) {
        logResult.absentType.forEach(id => {
          const offsetID = id - 1;
          user.absentStat[offsetID]++;
          depart.absentStat[offsetID]++;
        });
      }

      logResult.absentType = setAbsentTypeArrToStr(absentTable, logResult.absentType, checkDate);
      userDayResult.log = logResult;
    }

    user.daysLog.push(userDayResult);
  }
}

const constractReportData = async (userTables, absentTable, absentLog, timekeepLog, daysRange) => {
  let absentLogIndex = 0;
  let timekeepLogIndex = 0;
  let checkDate = daysRange.low;
  let blockingSince = Date.now()

  while (!DateUtils.areDatePartGt(checkDate, daysRange.high)) {
    clearUserInfoLogObj(userTables.LogInfo);
    
    for (; absentLogIndex < absentLog.length; absentLogIndex++) {
      const absentElem = absentLog[absentLogIndex];

      if (!DateUtils.areDatePartEq(checkDate, absentElem.date)) break;

      let userLogInfo = userTables.LogInfo[absentElem.employee_id];
      if (absentElem.absent_id !== null) {
        userLogInfo.log.absentType.push(absentElem.absent_id);
      }
      
      userLogInfo.log.note = absentElem.comment.length ? absentElem.comment : null;
    }

    for (; timekeepLogIndex < timekeepLog.length; timekeepLogIndex++) {
      const timekeepElem = timekeepLog[timekeepLogIndex];
      
      if (!DateUtils.areDatePartEq(checkDate, timekeepElem.time)) break;

      const userID = timekeepElem.id_user;
      let userLogInfo = userTables.LogInfo[userID];
      const userWorkType = userTables.Result[userLogInfo.departID].user[userID].timeType;

      setUserTimekeepLogTime(userWorkType, userLogInfo.log, timekeepElem);
    }

    aggregateUserLogDayInfo(userTables, absentTable, checkDate);

    checkDate = DateUtils.addDay(checkDate);
    if ((blockingSince + 200) < Date.now()) {
      await setImmediatePromise();
      blockingSince = Date.now();
    }
  }
}

const setReportDepartTreeObj = (id, obj) => {
  const users = obj.hasOwnProperty("users") ? obj.users : null;
  const absentStat = obj.hasOwnProperty("absentStat") ? obj.absentStat : null;

  const result = {
    id: Number(id),
    name: obj.name,
    absentStat: absentStat,
    users: users,
    child: obj.child
  };
  
  return result;
}

const setUserAbsenntReportObj = (absentTable, userResult) => {
  const result = {};
  result.name = userResult.name;
  result.id = userResult.userID;
  result.absentStat = absentStatsToDict(absentTable, userResult.absentStat);
  result.daysLog = userResult.daysLog;

  return result;
}

const insertDepartsTimekeepToHierarchy = (userResultTable, gatherDeparts, absentTable) => {
  for (const departID in userResultTable) {
    const insertDepart = userResultTable[departID];
    const depart = gatherDeparts[departID];
    
    depart.absentStat = insertDepart.absentStat;
    depart.users = [];

    for (const userID in insertDepart.user) {
      //console.log(userID, insertDepart.user[userID]);
      const userReport = setUserAbsenntReportObj(absentTable, insertDepart.user[userID]);
      depart.users.push(userReport);
    }

    depart.users.sort((a, b) => a.name.localeCompare(b.name));

    let parentID = depart.parentID;
    while (parentID !== null) {
      let parentDepart = gatherDeparts[parentID];

      if (!parentDepart.hasOwnProperty("absentStat")) {
        parentDepart.absentStat = initArray(absentTable.idToNameMap.length, 0);
      }

      for (let i = 0; i < parentDepart.absentStat.length; i++) {
        parentDepart.absentStat[i] += insertDepart.absentStat[i];
      }

      parentID = parentDepart.parentID;
    }
  }
}

const buildAbsentInfoReport = (userResultTable, gatherDeparts, absentTable) => {
  insertDepartsTimekeepToHierarchy(userResultTable, gatherDeparts, absentTable);
  
  for (const departID in gatherDeparts) {
    const depart = gatherDeparts[departID];
    
    if (depart.hasOwnProperty("absentStat")) {
      //console.log(depart);
      depart.absentStat = absentStatsToDict(absentTable, depart.absentStat);
    }
  }
  
  //console.log(gatherDeparts);
  const result = buildResultDepartsHierarchy(gatherDeparts, setReportDepartTreeObj);
  return result;
}

const buildFullReport = (userResultTable, gatherDeparts, absentTable) => {

}


exports.processGetDivisionsReports = async (departs, type, daysRange) => {
  const lowDateStr = DateUtils.getDatePartStr(daysRange.low);
  const highDateStr = DateUtils.getDatePartStr(daysRange.high);
  
  let gatherDeparts = await gatherDepartHierarchy(departs);
  console.log(gatherDeparts);

  let pendingReq = [];
  const pendingReqParams = [departs, lowDateStr, highDateStr];
  pendingReq.push(dbCon.query(sqlQueryList.getAbsentType));
  pendingReq.push(dbCon.query(sqlQueryList.getMultipleDivisionEmployees, [departs]));
  pendingReq.push(dbCon.query(sqlQueryList.getDivisionsAbsentLog, pendingReqParams));

  const timekeepLogPendignReq = dbCon.query(sqlQueryList.getDivisionsTimekeepLog, pendingReqParams);
  const [absentType, employees, absentLog] = await Promise.all(pendingReq);

  //console.log(employees);

  //console.log(absentLog.length);
  const absentTable = buildAbsentTabel(absentType);
  let userTables = initUserInfoLookUpTabels(employees, absentTable.idToNameMap.length);
  const timekeepLog = await timekeepLogPendignReq;
  //console.log(timekeepLog);

  console.time("processReport");
  console.time('constractReportData');
  //console.log(userResultTable);

  await constractReportData(userTables, absentTable, absentLog, timekeepLog, daysRange);
  delete timekeepLog;
  delete absentLog;

  // for (let userID in userResultTable['96'].user) {
  //   console.log(userResultTable['96'].user[userID].name, userResultTable['96'].user[userID].absentStat);
  // }
  
  console.timeEnd('constractReportData');  
  console.time("buildReport");

  let result = null;
  if ((type === "web") || (type === "general")) {
    result = buildAbsentInfoReport(userTables.Result, gatherDeparts, absentTable);
    console.log(result);
  } else if (type === "full") {
    result = buildFullReport(userTables.Result, gatherDeparts, absentTable);
  }
  
  console.timeEnd("buildReport");
  console.timeEnd("processReport");
  
  const used = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`Used memory: ${used}`);
  
  console.log(JSON.stringify(result, null, 3));

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
