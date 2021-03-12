const mysql2 = require("mysql2");
const DateUtils = require("../utils/date");

// TODO: Add pool
class DbConnection {
    constructor(options) {
        this.dbCon = mysql2.createConnection(options).promise();
    }

    async query(query, params) {
      try {
          //console.log("QUERY: " + query);
          const [ result ] = await this.dbCon.query(query, params);
          return result;
      } catch (e) {
          const date = DateUtils.getCurrentDataTimeForLog();
          const errorMsg = "Error: " + e;
          console.log(date + " - " + errorMsg.red)
      
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
        const date = DateUtils.getCurrentDataTimeForLog();
        console.log(date.green + " - " + e.red)
    
        return null;
      }
    }

    async gather(queryArray) {
      try {
        const queryResponse = await Promise.all(queryArray);
        const result = queryResponse.map(item => item[0]);
        return result;
      } catch (e) {
        const date = DateUtils.getCurrentDataTimeForLog();
        console.log(date.green + " - " + e.red)
    
        return null;
      }
    }
}

module.exports = DbConnection;