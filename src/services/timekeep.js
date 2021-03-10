
const mysql2 = require("mysql2");
const DbConnection = require("../utils/db");

const { dbConnectionParams } = require("../configs/info.js");

const { sqlQueryList } = require("../options/timekeep");

const DateUtils = require("../utils/date");

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

const prepareDivisionTimekeepAggr = (completeArray, users, date, absentType) => {
  let aggregatedUserResult = {};
  
  users.forEach(user => {
    // опоздание, прогул, ранний уход
    if ((user.absent_id !== null) && (user.absent_id !== 1) && (user.absent_id !== 2) && (user.absent_id !== 7)) {
      let userObj = {
        name: user.name,
        absentType: absentType[user.absent_id - 1].name,
        enter: null,
        exit: null,
        worked: null
      };

      completeArray.push(userObj);
    } else {
      const startTime = DateUtils.setTimeFromStr(date, user.begin_workday);
      const endTime = DateUtils.setTimeFromStr(date, user.end_workday);

      aggregatedUserResult[user.id_user] = {
        name: user.name,
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

// TODO: DEBUG!!!!!!!!!!
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
  
  if (log.direction === 1) {
    if (userObj.firstIn === null) {
      userObj.firstIn = logTime;
    } else {
      if (logTime > userObj.firstIn)  userObj.lastOut = logTime
    }
  }
}

const calcStricWorkTime = (start, end) => {

}

const calcNotStricWorkTime = (start, end) => {

}

exports.processGetDivisionStat = async (divisionID, date) => {
  let result = [];
  
  const timeRange = DateUtils.getTimeRangeForDate(date);
  
  let pendingReq = [];
  pendingReq.push(dbCon.castQuery(sqlQueryList.getAbsentType));
  pendingReq.push(dbCon.castQuery(
    sqlQueryList.getEmployeesDivisionInfo, [timeRange.low.str, timeRange.high.str, divisionID]));

  const [absentType, users] = await dbCon.gather(pendingReq);
  if (!users.length) return null;
  
  const timekeepLogPendingReq = dbCon.castQuery(
    sqlQueryList.getDivisionTimekeepLog, [divisionID, timeRange.low.str, timeRange.high.str]);
    
  let aggregatedUser = prepareDivisionTimekeepAggr(result, users, timeRange.low.date, absentType);
  let timekeepLog = await dbCon.getResponse(timekeepLogPendingReq);
  
  timekeepLog.forEach(log => {
    let userObj = aggregatedUser[log.id_user];
    console.log(userObj)
    if (userObj.timeType === 1) {
      setUserStricTimekeepLogTime(userObj, log);
    } else if (userObj.timeType === 2) {
      setUserNotStricTimekeepLogTime(userObj, log);
    }
  });

  console.log(aggregatedUser);

  const currentDate = DateUtils.getNowDate();
  const currentTime = (new Date()).getTime();
  const islookAtCurrDate = timeRange.low.date.getTime() === currentDate.getTime();

  for (const key in aggregatedUser) {
    const userLog = aggregatedUser[key];
    
    let userResult = {
      name: userLog.name,
      absentType: null,
      enter: null,
      exit: null,
      worked: null
    };

    const startTime = userLog.start.getTime();
    const endTime = userLog.end.getTime();
    
    if (userLog.firstIn !== null)  {
      const enterDate = new Date(userLog.firstIn);
      userResult.enter = DateUtils.getTimePartStr(enterDate);
      
      if (startTime < userLog.firstIn) {
        userResult.absentType = "Опоздание";
      }
    }

    if (userLog.lastOut !== null)  {
      const exitDate = new Date(userLog.lastOut);
      userResult.exit = DateUtils.getTimePartStr(exitDate);

      if (islookAtCurrDate && (currentTime > endTime)) {
        if (endTime > userLog.lastOut) {
          userResult.absentType = "Ранний уход";
        }
      }
    }

    if ((userLog.firstIn !== null) && (userLog.lastOut !== null))  {
      ///
      const workedTime = new Date(userLog.lastOut - userLog.firstIn);
      userResult.worked = DateUtils.getTimePartStr(workedTime);
      console.log(userLog.name, workedTime, workedTime.getHours());
      ///
    }

    if (((userLog.firstIn !== null) && (userLog.lastOut == null)) || 
    ((userLog.firstIn === null) && (userLog.lastOut !== null)))
    {
      userResult.absentType = "Опоздание";
    }
    
    result.push(userResult);
  }

  result.sort((a, b) => a.name.localeCompare(b.name));

  //console.log(result);
}
