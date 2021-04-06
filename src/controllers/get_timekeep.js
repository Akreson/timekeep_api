const asynchandler = require("express-async-handler");
const ErrorResponse = require("../utils/error-response")
const { ReportTypes } = require("../configs/info");

const {
  succsesResponse,
  isValidStrParam,
  parseParamPassDate,
  convertPassDate
} = require("./common");

const {
    processGetUserDepartAccessList,
    provessGetAllDepartsWithUserMarks,
    processGetDivisionTimekeepStat,
    processGetUserTimekeepLog,
    processGetDivisionsReports
} = require("../services/get_timekeep.js")


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

exports.getAllDepartsWithUserMarks = asynchandler(async (req, res, next) => {
  const ldapName = req.params.ldapName;
  if (!isValidStrParam(ldapName)) {
    return next(new ErrorResponse("Неуказан поисковый LDAP логин", 400, "ValidationError"));
  }

  const response = await provessGetAllDepartsWithUserMarks(ldapName);
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

exports.getDivisionsReports = asynchandler(async (req, res, next) => {
  const reqData = req.body["data"];

  if (isValidStrParam(reqData.type)) {
    if (!ReportTypes.hasOwnProperty(reqData.type)) {
      return next(new ErrorResponse("Не поддерживаемый формат отчета", 400, "ValidationError"));  
    }
  } else {
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

  if ((reqData.departs !== undefined) && reqData.departs.length) {
    const InvalidDepartId = reqData.departs.findIndex(id => {
      if (typeof id === "number") return false;
      return true;
    });

    if (InvalidDepartId !== -1) {
      return next(new ErrorResponse(`Неверно указан идентификатор отдела под индексом ${InvalidDepartId}`, 400, "ValidationError"));  
    }
  } else {
    return next(new ErrorResponse("Неуказаны отделы для отчета", 400, "ValidationError"));
  }

  const type = {
    report: reqData.type,
    absent: null,
  };

  if ((reqData.onlyType !== undefined) && (reqData.onlyType !== null)) {
    if (!Array.isArray(reqData.onlyType)) {
      return next(new ErrorResponse(`Неверно указан тип параметра ${onlyType}, должен быть массив`, 400, "ValidationError"));  
    }

    type.absent = reqData.onlyType.length ? reqData.onlyType : null;
  }

  const daysRange = {
    low: lowDate,
    high: highDate
  };

  const response = await processGetDivisionsReports(reqData.departs, type, daysRange);
  if (!response) {
    return next(new ErrorResponse("Данных не найдено", 400, "ValidationError"));
  }

  const result = succsesResponse(response);
  res.json(result);
});