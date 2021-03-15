
const mysql2 = require("mysql2");
const DbConnection = require("../utils/db");
const DateUtils = require("../utils/date");

const { dbConnectionParams } = require("../configs/info.js");
const { sqlQueryList } = require("../options/timekeep");

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
  
  let departIDToReq = initUserDepart.map(item => {
    return item.department_id;
  });
  
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

  const gatherDeparts = await gatherDepartHierarchy(userAllowDepart);
  const result = buildResultDepartsHierarchy(gatherDeparts);

  return result;
}

const getUserLogObj = () => {
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

const prepareDivisionTimekeepAggr = (completeArray, users, checkDate, absentTypeArr) => {
  let aggregatedUserResult = {};
  
  users.forEach(user => {
    let userObj = getUserLogObj();

    // опоздание, прогул, ранний уход
    const isNotTimekeepAbsent = (user.absent_id !== null) &&
      (user.absent_id !== 1) && (user.absent_id !== 2) && (user.absent_id !== 7);

    if (DateUtils.areDatePartEq(user.dt_creation, checkDate)) {
      userObj.note = "заведен в табельный учет";
    }

    if (DateUtils.areDatePartGt(user.dt_creation, checkDate)) {
      userObj.name = user.name;
      userObj.ldapName = user.id_user;
      completeArray.push(userObj);
    } else {
      const startTime = DateUtils.setTimeFromStr(checkDate, user.begin_workday);
      const endTime = DateUtils.setTimeFromStr(checkDate, user.end_workday);
      const setAbsent = isNotTimekeepAbsent ? absentTypeArr[user.absent_id - 1].name : null;
      
      aggregatedUserResult[user.id_user] = {
        name: user.name,
        absentType: setAbsent,
        timeType: user.time_worked_type,
        // date obj
        start: startTime,
        end: endTime,
        // millisecond
        firstIn: null,
        lastOut: null
      };
    }
  });

  return aggregatedUserResult;
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
    if (userObj.lastOut === null) {
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

const aggregatedDivisionLogStats = (resultArr, aggregatedUser, timeRange) => {
  const currentDate = DateUtils.getNowDate();
  const currentTime = (new Date()).getTime();
  const islookAtCurrDate = timeRange.low.date.getTime() === currentDate.getTime();
  
  for (const key in aggregatedUser) {
    const userLog = aggregatedUser[key];
    
    let userResult = getUserLogObj();
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

    resultArr.push(userResult);
  }
}

exports.processGetDivisionTimekeepStat = async (divisionID, date) => {
  let result = [];
  const timeRange = DateUtils.getTimeRangeForDate(date);
  
  let pendingReq = [];
  pendingReq.push(dbCon.castQuery(sqlQueryList.getAbsentType));
  pendingReq.push(dbCon.castQuery(
    sqlQueryList.getEmployeesDivisionInfoWithAbsent, [timeRange.low.str, timeRange.high.str, divisionID]));

  const [absentType, users] = await dbCon.gather(pendingReq);
  if (!users.length) return null;
  
  const timekeepLogPendingReq = dbCon.castQuery(
    sqlQueryList.getDivisionTimekeepLog, [divisionID, timeRange.low.str, timeRange.high.str]);
  
  let aggregatedUser = prepareDivisionTimekeepAggr(result, users, timeRange.low.date, absentType);
  let timekeepLog = await dbCon.getResponse(timekeepLogPendingReq);
  if (!timekeepLog.length) return null;
  
  timekeepLog.forEach(log => {
    let userObj = aggregatedUser[log.id_user];

    if (userObj.timeType === 1) {
      setUserStricTimekeepLogTime(userObj, log);
    } else if (userObj.timeType === 2) {
      setUserNotStricTimekeepLogTime(userObj, log);
    }
  });

  aggregatedDivisionLogStats(result, aggregatedUser, timeRange);
  result.sort((a, b) => a.name.localeCompare(b.name));
  //console.log(result);

  return result;
}

exports.processGetUserTimekeepLog = async (ldapName, date) => {
  const timeRange = DateUtils.getTimeRangeForDate(date);

  let pendingReg = [];
  const pendingRegParams = [timeRange.low.str, timeRange.high.str, ldapName];
  pendingReg.push(dbCon.castQuery(sqlQueryList.getUserInfoWithAbsent, pendingRegParams));
  pendingReg.push(dbCon.castQuery(sqlQueryList.getUserTimekeepLog, pendingRegParams));
  pendingReg.push(dbCon.castQuery(sqlQueryList.getAbsentType));

  const [userInfo, timekeepLog, absentType] = await dbCon.gather(pendingReg);
  if (!userInfo.length || !timekeepLog.length) return null;
  
  console.log(userInfo);
  console.log(timekeepLog);

  let contrIdToName = {};
}
