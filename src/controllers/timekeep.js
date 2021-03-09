const asynchandler = require("express-async-handler");
const ErrorResponse = require("../utils/error-response")

const {
  getNowDate,
  getTimeRangeForDay
} = require("../utils/shared");

const {
    processGetUserDepartAccessList,
    processGetDivisionStat
} = require("../services/timekeep.js")

const succsesResponse = responseResult => {
  let result = {
    error: false,
    errorDesc: "",
    response: responseResult
  };

  return result;
}

const isValidGetParam = param => {
  if ((param === undefined) || (typeof param !== "string") || (param.length === 0)) {
    return false;
  }

  return true;
}
// TODO: extend error output

exports.getUserDepartmentsAccessList = asynchandler(async (req, res, next) => {
  const ldapName = req.params.ldapName;
  if (!isValidGetParam(ldapName)) {
    return next(new ErrorResponse("Невказаний пошуковий LDAP логін", 400, "ValidationError"));
  }

  const response = await processGetUserDepartAccessList(ldapName);
  if (!response) {
    return next(new ErrorResponse("Помилка", 400, "ValidationError"));
  }

  const result = succsesResponse(response);
  res.json(result);
})

const parseDivisionStatsDate = checkDate => {
  const [day, month, year] = checkDate.split(".").map(item => Number(item));

  if ((day === undefined) || (day === NaN) || ((day < 1) || (day > 31))) return null;
  if ((month === undefined) || (month === NaN) || ((month < 1) || (month > 12))) return null;
  if ((year === undefined) || (year === NaN) || (year < 1970)) return null;

  let date = new Date(year, month - 1, day);
  return date
}

exports.getDvisionTimekeepInfo = asynchandler(async (req, res, next) => {
  const divisionID = req.params.divisionID;
  const passDate = req.params.date;
  
  if (!isValidGetParam(divisionID)) {
    return next(new ErrorResponse("Невказаний підрозділ для запиту", 400, "ValidationError"));
  }
  
  // TODO: Only for division id
  if (divisionID.search(/^\d+$/) === -1) {
    return next(new ErrorResponse("Невірно заданий ідентифікатор підрозділу", 400, "ValidationError"));
  }
  
  let date = null;
  if (passDate !== undefined) {
    date = parseDivisionStatsDate(passDate);

    if (date === null) {
      return next(new ErrorResponse("Невірно задана дата", 400, "ValidationError"));
    }
  } else {
    date = getNowDate();
  }

  const response = await processGetDivisionStat(Number(divisionID), date);

  res.json("OK");
});