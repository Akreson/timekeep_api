const mysql2 = require("mysql2");
const DateUtils = require("./date");

const {
  setImmediatePromise
} = require("./shared");

let GLOBAL_COUNTER = 0;

class ListElement {
  constructor(elem = null) {
    this.index = GLOBAL_COUNTER++; // NOTE: for debug

    this.cb = null;
    this.data = elem;
    this.next = null;
    this.prev = null;
  }
}

class List {
  constructor(elem) {
    this.itemCount = 0;
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

  remove(elem) {
    if (elem != null) {
      elem.next.prev = elem.prev;
      elem.prev.next = elem.next;
      elem.next = null;
      elem.prev = null;
    }
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
  constructor(options, poolSize = 10) {
    this.connOptions = options;
    this.poolSize = poolSize;
    this.freeConnList = new List();
    this.connList = new List();
    GLOBAL_COUNTER = 0;
    this.connUsedCount = 0;
  }

  _createNewElem() {
    let newConn = mysql2.createConnection(this.connOptions).promise();
    const newConnElem = new ListElement(newConn);

    ++this.connUsedCount;
    return newConnElem;
  }

  async _getFreeConn() {
    let resultConn = null;
    
    while (true) {
      const connElem = this.freeConnList.getFirst();
    
      if (connElem === null) {
        if (this.connUsedCount == this.poolSize) {
          await setImmediatePromise();
        } else {
          let newConnElem = this._createNewElem()
          this.connList.insert(newConnElem);
      
          resultConn = newConnElem.data;
          break;
        }
      } else {
        clearTimeout(connElem.cb);
        this.connList.insert(connElem);
        resultConn = connElem.data;
        break;
      }
    }

    return resultConn;
  }

  _releaseConn(connElem) {
    this.freeConnList.remove(connElem)
    connElem.data.end();
    connElem = null;
    
    --this.connUsedCount;
  }

  _putConnToFreeList(conn) {
    const releaseTime = 5 * DateUtils.millisecInSec;

    let connElem = this.connList.getbyData(conn);
    connElem.cb = setTimeout(this._releaseConn.bind(this, connElem), releaseTime);
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