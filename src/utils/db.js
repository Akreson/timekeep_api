const mysql2 = require("mysql2");
const DateUtils = require("../utils/date");

// function setImmediatePromise() {
//   return new Promise((resolve) => {
//     setImmediate(() => resolve());
//   });
// }

const setImmediatePromise = async () => {
  setImmediate(() => Promise.resolve());
}

class ListItem {
  constructor(item) {
    this.data = item;
    this.next = null;
    this.prev = null;
  }
}

class List {

}


// TODO: Add pool
class DbConnection {
    constructor(options, poolSize = 10) {
      // this.freeConnList = null;
      // this.connList = null;
      // this.pendingReq = null;

      // for (let i = 0; i < poolSize; ++i) {
      //   let conn = mysql2.createConnection(options).promise();

      //   if (this.freeConnList === null) {
      //     this.freeConnList = new ConnListItem(conn);
      //   } else {
      //     this.freeConnList.next = new ConnListItem(conn);
      //   }
      // }
      
      this.dbCon = mysql2.createConnection(options).promise();
    }

    async makeQuery(query, params) {

    }

    async query(query, params) {
      try {
          const [ result ] = await this.dbCon.query(query, params);
          return result;
      } catch (e) {
          const date = DateUtils.getCurrentDateTimeForLog();
          console.log(date + " - " + e.red)
          return null;
      }
    }
    
    castQuery(query, params) {
      return this.dbCon.query(query, params);
    }

    async getResponse(pendingQuery) {
      try {
        const [ result ] = await pendingQuery;
        return result;
      } catch (e) {
        const date = DateUtils.getCurrentDateTimeForLog();
        console.log(date.green + " - " + e.red)
        return null;
      }
    }

    async gather(queryArray) {
      try {
        console.log(queryArray);
        const queryResponse = await Promise.all(queryArray);
        const result = queryResponse.map(item => item[0]);
        return result;
      } catch (e) {
        const date = DateUtils.getCurrentDateTimeForLog();
        console.log(date.green + " - " + e.red)
        return null;
      }
    }
}

module.exports = DbConnection;