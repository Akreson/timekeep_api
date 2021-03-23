const mysql2 = require("mysql2");
const DateUtils = require("../utils/date");

const {
  setImmediatePromise
} = require("../utils/shared");

let GLOBAL_COUNTER = 0;

class ListElement {
  constructor(elem = null) {
    this.index = GLOBAL_COUNTER++; // NOTE: for debug

    this.data = elem;
    this.next = null;
    this.prev = null;
  }
}

class List {
  constructor(elem) {
    this.sentinel = new ListElement();
    this.sentinel.next = this.sentinel;
    this.sentinel.prev = this.sentinel;

    this.sentinel.index = null;
  }

  printIDs() {
    for (let elem = this.sentinel.next; elem !== this.sentinel; elem = elem.next) {
      process.stdout.write(`${elem.index} `);
    }
    process.stdout.write("\n");
  }

  insert(elem) {
    elem.next = this.sentinel;
    elem.prev = this.sentinel.prev;
    elem.next.prev = elem;
    elem.prev.next = elem;
  }

  getFirst() {
    if (this.sentinel.next === this.sentinel) return null;
    
    let elem = this.sentinel.next;
    this.sentinel.next = elem.next;
    elem.next.prev = this.sentinel;

    elem.next = null;
    elem.prev = null;

    return elem;
  }

  getbyData(data) {
    let resultItem = null;

    for (let elem = this.sentinel.next; elem !== this.sentinel; elem = elem.next) {
      if (elem.data = data) {
        resultItem = elem;
        break;
      }
    }

    if (resultItem) {
      resultItem.next.prev = resultItem.prev;
      resultItem.prev.next = resultItem.next;
      resultItem.next = null;
      resultItem.prev = null;
    }

    return resultItem;
  }
}

class DbConnection {
  constructor(options, poolSize = 1) {
    this.freeConnList = new List();
    this.connList = new List();
    GLOBAL_COUNTER = 0;

    for (let i = 0; i < poolSize; ++i) {
      let conn = mysql2.createConnection(options).promise();
      const connElem = new ListElement(conn);
      this.freeConnList.insert(connElem);
    }
  }

  async _getFreeConn() {
    let resultConn = null;
    
    while (true) {
      const connElem = this.freeConnList.getFirst();
      
      if (connElem === null) {
        await setImmediatePromise();
      } else {
        resultConn = connElem.data;
        this.connList.insert(connElem);
        break;
      }
    }

    return resultConn;
  }

  _putConnToFreeList(conn) {
    let connElem = this.connList.getbyData(conn);
    this.freeConnList.insert(connElem);
  }

  async query(query, params) {
    try {
      //console.log(params);
      const dbCon = await this._getFreeConn();

      const [ result ] = await dbCon.query(query, params);
      this._putConnToFreeList(dbCon);

      return result;
    } catch (e) {
      const date = DateUtils.getCurrentDateTimeForLog();
      console.log(query);
      console.log(date.green + ' ' + e.red)
      return null;
    }
  }
}

module.exports = DbConnection;