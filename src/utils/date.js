
class DateUtils {
  static millisecInSec = 1000;
  static minutesToMillisec = 60*1000;
  static hoursToMillisec = 60*60*1000;
  static daysToMillisec = 24*60*60*1000;
  
  constructor() {}

  // Автоматически учитовает часовой пояс
  static dateToISOstr = date => {
    if (!(date instanceof Date)) return null;

    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let getSeconds = date.getSeconds();

    month = month < 10 ? '0' + month : month;
    day = day < 10 ? '0' + day : day;
    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    getSeconds = getSeconds < 10 ? '0' + getSeconds : getSeconds;

    const dateISOstr = `${year}-${month}-${day}T${hours}:${minutes}:${getSeconds}`;
    return dateISOstr;
  }

  static getDatePartArr(date) {
    const years = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    return [years, month, day];
  }

  static getDatePartObj(date) {
    const years = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    let resultDate = new Date(years, month, day);
    return resultDate;
  }

  static getTimePart(date) {
    let hours = date.getHours();
    let minutes = date.getMinutes();
    let seconds = date.getSeconds();

    return [hours, minutes, seconds];
  }

  static setTimeFromStr(date, timeStr) {
    let resultDate = new Date(date);
    const [hours, minutes, seconds] = timeStr.split(":").map(item => Number(item));
    resultDate.setHours(hours, minutes, seconds);

    return resultDate;
  }

  static millisecToTimeStr(millisec) {

  }

  static getNowDate(passDate) {
    const date = passDate === undefined ? new Date() : new Date(passDate);
    date.setHours(0, 0, 0);
    
    return date;
  }

  static getNowDateStr(passDate) {
    const date = DateUtils.getNowDate(passDate)
    return DateUtils.dateToISOstr(date);
  }

  static getTimeRangeForDate(date) {
    let low = new Date(date);
    low.setHours(0, 0, 0);
  
    let high = new Date(low);
    high.setHours(23, 59, 59);
  
    // поле date в UTC формате
    const result = {
      low: {
        date: low,
        str: DateUtils.dateToISOstr(low),
      },
      high:{
        date: high,
        str: DateUtils.dateToISOstr(high)
      }
    };
  
    return result;
  }

  static getCurrentDataTimeForLog() {
    const date = new Date().toLocaleString("uk-UK", {timeZone: "Europe/Kiev"});
    return date;
  }

  static areDatePartEq(date1, date2) {
    
  }
}

module.exports = DateUtils;