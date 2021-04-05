exports.succsesResponse = responseResult => {
  let result = {
    error: false,
    errorDesc: "",
    response: responseResult
  };

  return result;
}
  
exports.isValidStrParam = param => {
  if ((param === undefined) || (typeof param !== "string") || (param.length === 0)) {
    return false;
  }

  return true;
}
  
exports.parseParamPassDate = checkDate => {
  const [day, month, year] = checkDate.split(".").map(item => Number(item));

  if ((day === undefined) || isNaN(day) || ((day < 1) || (day > 31))) return null;
  if ((month === undefined) || isNaN(month) || ((month < 1) || (month > 12))) return null;
  if ((year === undefined) || isNaN(year) || (year < 1970)) return null;

  let date = new Date(year, month - 1, day);
  return date
}
  
exports.convertPassDate = passDate => {
  let result = null;
  if (passDate !== undefined) {
      result = this.parseParamPassDate(passDate);
  } else {
      result = DateUtils.getNowDate();
  }

  return result;
}