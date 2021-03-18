const asynchandler = require("express-async-handler");
const ErrorResponse = require("../utils/error-response")
const DateUtils = require("../utils/date");

const {
    processGetUserDepartAccessList,
    processGetDivisionTimekeepStat,
    processGetUserTimekeepLog,
    processGetDivisionsReports
} = require("../services/timekeep.js")

const succsesResponse = responseResult => {
  let result = {
    error: false,
    errorDesc: "",
    response: responseResult
  };

  return result;
}

const isValidStrParam = param => {
  if ((param === undefined) || (typeof param !== "string") || (param.length === 0)) {
    return false;
  }

  return true;
}

const parseParamPassDate = checkDate => {
  const [day, month, year] = checkDate.split(".").map(item => Number(item));

  if ((day === undefined) || (day === NaN) || ((day < 1) || (day > 31))) return null;
  if ((month === undefined) || (month === NaN) || ((month < 1) || (month > 12))) return null;
  if ((year === undefined) || (year === NaN) || (year < 1970)) return null;

  let date = new Date(year, month - 1, day);
  return date
}

const convertPassDate = date => {
  let result = null;
  if (date !== undefined) {
    result = parseParamPassDate(passDate);
  } else {
    result = DateUtils.getNowDate();
  }

  return result;
}

// TODO: extend error output

exports.getUserDepartmentsAccessList = asynchandler(async (req, res, next) => {
  const ldapName = req.params.ldapName;
  if (!isValidStrParam(ldapName)) {
    return next(new ErrorResponse("Неуказан поисковый LDAP логин", 400, "ValidationError"));
  }

  const response = await processGetUserDepartAccessList(ldapName);
  if (!response) {
    return next(new ErrorResponse("Ошибка", 400, "ValidationError"));
  }

  const result = succsesResponse(response);
  res.json(result);
});

exports.getDvisionTimekeepInfo = asynchandler(async (req, res, next) => {
  const divisionID = req.params.divisionID;
  const passDate = req.params.date;
  
  if (!isValidStrParam(divisionID)) {
    return next(new ErrorResponse("Неуказано отдел для запроса ", 400, "ValidationError"));
  }
  
  // TODO: Only for division id
  if (divisionID.search(/^\d+$/) === -1) {
    return next(new ErrorResponse("Неправильно задан идентификатор отдела", 400, "ValidationError"));
  }
  
  let date = convertPassDate(passDate);
  if (date === null) {
    return next(new ErrorResponse("Неверно заданая дата", 400, "ValidationError"));
  }

  const response = await processGetDivisionTimekeepStat(Number(divisionID), date);
  if (!response) {
    return next(new ErrorResponse("Данных не найдено", 400, "ValidationError"));
  }

  const result = succsesResponse(response);
  res.json(result);
});

exports.getUserTimekeepLog = asynchandler(async (req, res, next) => {
  const ldapName = req.params.ldapName;
  const passDate = req.params.date;

  if (!isValidStrParam(ldapName)) {
    return next(new ErrorResponse("Не указан поисковый LDAP логин", 400, "ValidationError"));
  }

  let date = convertPassDate(passDate);
  if (date === null) {
    return next(new ErrorResponse("Неверно заданая дата", 400, "ValidationError"));
  }

  const response = await processGetUserTimekeepLog(ldapName, date);
  if (!response) {
    return next(new ErrorResponse("Данных не найдено", 400, "ValidationError"));
  }

  const result = succsesResponse(response);
  res.json(result);
});

// date: {
//   low: date,
//   high: date,
//   type: str,
//   departs: [ids...],
// }

exports.getDivisionsReports = asynchandler(async (req, res, next) => {
  const reqData = req.body["data"];

  if (!isValidStrParam(reqData.type)) {
    return next(new ErrorResponse("Неверно указан тип отчета", 400, "ValidationError"));
  }

  let lowDate = convertPassDate(reqData.low);
  if (lowDate === null) {
    return next(new ErrorResponse("Неверно заданая начальная дата", 400, "ValidationError"));
  }

  let highDate = convertPassDate(reqData.high);
  if (highDate === null) {
    return next(new ErrorResponse("Неверно заданая конечная дата", 400, "ValidationError"));
  }

  if ((reqDate.departs !== undefined) && reqDate.departs.length) {
    const InvalidDepartId = reqDate.departs.findIndex(id => {
      if (typeof id === "number") return false;
      return true;
    });

    if (InvalidDepartId !== -1) {
      return next(new ErrorResponse(`Неверно указан идентификатор отдела под индексом ${InvalidDepartId}`, 400, "ValidationError"));  
    }
  } else {
    return next(new ErrorResponse("Неуказаны отделы для отчета", 400, "ValidationError"));
  }

  const response = processGetDivisionsReports(departs, type, lowDate, highDate);
  
  if (!response) {
    return next(new ErrorResponse("Данных не найдено", 400, "ValidationError"));
  }

  const result = succsesResponse(response);
  res.json(result);
});