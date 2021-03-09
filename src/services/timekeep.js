
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

const setUserTimekeepLogTime = (userObj, log) => {
  const logTime = log.time.getTime();

  // 1 - in, 0 - out
  if (log.direction === 1) {
    if (userObj.firstIn === null) {
      userObj.firstIn = logTime;
    } else {
      if (logTime < userObj.firstIn)  userObj.firstIn = logTime
    }
  }
  else if (log.direction === 0) {
    if (userObj.lastOut === null) {
      userObj.lastOut = logTime;
    } else {
      if (logTime > userObj.lastOut)  userObj.lastOut = logTime
    }
  }
}

exports.processGetDivisionStat = async (divisionID, date) => {
  let result = [];
  
  const currentDate = DateUtils.getNowDate();
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
    setUserTimekeepLogTime(userObj, log);
  });

  const islookAtCurrDate = timeRange.low.date.getTime() === currentDate.getTime();
  for (const [id, value] in aggregatedUser) {
    const startTime = value.start.getTime();
    //const endTime = value.end.getTime();
    const startDiff = startTime - value.firstIn;
    // TODO: CONTINUE
    //if (startDiff < 0)
  }

  console.log(aggregatedUser);
}