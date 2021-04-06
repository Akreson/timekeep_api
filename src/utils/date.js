
class DateUtils {
  static millisecInSec = 1000;
  static minutesToMillisec = 60*1000;
  static hoursToMillisec = 60*60*1000;
  static daysToMillisec = 24*60*60*1000;
  static timezoneInMinutes = (new Date()).getTimezoneOffset();
  
  constructor() {}
  
  // Автоматически учитывает часовой пояс
  static dateToISOstr(date) {
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

  static getDatePartStr(date) {
    let [years, month, day] = DateUtils.getDatePartArr(date);
    month++;

    month = month < 10 ? '0' + month : month;
    day = day < 10 ? '0' + day : day;

    return `${years}-${month}-${day}`;
  }

  static getDatePartStrCustom(date) {
    let [years, month, day] = DateUtils.getDatePartArr(date);
    
    month++;
    month = month < 10 ? '0' + month : month;

    return `${day}.${month}.${years}`;
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

  static getTimeArrFromStr(timeStr) {
    const result = timeStr.split(":").map(item => Number(item));
    return result;
  }

  static getTimePartStr(date) {
    let [hours, minutes, seconds] = DateUtils.getTimePart(date);

    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;

    return `${hours}:${minutes}:${seconds}`;
  }

  static getUTCTimePartStr(date) {
    let hours = date.getUTCHours();
    let minutes = date.getUTCMinutes();
    let seconds = date.getUTCSeconds();

    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;

    return `${hours}:${minutes}:${seconds}`;
  }

  static setTimeFromStr(date, timeStr) {
    let resultDate = new Date(date);
    const [hours, minutes, seconds] = timeStr.split(":").map(item => Number(item));
    resultDate.setHours(hours, minutes, seconds);

    return resultDate;
  }

  static setTimeFromArr(date, timeArr) {
    let resultDate = new Date(date);
    resultDate.setHours(timeArr[0], timeArr[1], timeArr[2]);

    return resultDate;
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

  static getCurrentDateTimeForLog() {
    const date = new Date().toLocaleString("uk-UK", {timeZone: "Europe/Kiev"});
    return date;
  }

  static getTimezoneInMillisec() {
    const offset = -DateUtils.timezoneInMinutes * DateUtils.hoursToMillisec;
    return offset;
  }

  static addDay(date, count = 1) {
    const millisecToAdd = count * DateUtils.daysToMillisec;
    const dateResult = new Date(date.getTime() + millisecToAdd);
    return dateResult;
  }

  static addDayClamp(date, max, count = 1) {
    let result = DateUtils.addDay(date, count);
    if (DateUtils.areDatePartGt(result, max)) {
      result = max;
    }

    return result;
  }

  static daysBeetween(begin, end) {
    const count = (end - begin) / DateUtils.daysToMillisec;
    return Math.floor(count);
  }

  // less then
  static areDatePartLt(date1, date2) {
    const dateObj1 = DateUtils.getDatePartObj(date1);
    const dateObj2 = DateUtils.getDatePartObj(date2);

    return dateObj1.getTime() < dateObj2.getTime();
  }

  // greater thern
  static areDatePartGt(date1, date2) {
    const dateObj1 = DateUtils.getDatePartObj(date1);
    const dateObj2 = DateUtils.getDatePartObj(date2);

    return dateObj1.getTime() > dateObj2.getTime();
  }

  // equal
  static areDatePartEq(date1, date2) {
    const dateObj1 = DateUtils.getDatePartObj(date1);
    const dateObj2 = DateUtils.getDatePartObj(date2);

    return dateObj1.getTime() === dateObj2.getTime();
  }

  static isDayOff(date) {
    const dayNum = date.getDay();
    const result = ((dayNum === 6) || (dayNum === 0)) ? true : false; 
    return result;
  }
}

module.exports = DateUtils;