const express = require("express");

const { logger } = require("./src/middlewares/logger");
const { errorHandler } = require("./src/middlewares/error-handler");

const timekeepRoutes = require("./src/routers/timekeep");
//const configs = require("./src/configs/");

const app = express();

app.use(express.json());

app.use(logger);

app.use("/api/timekeep", timekeepRoutes);

app.use("/api/*", (req, res, next) => {
  return next(new ErrorResponse("Метод не підтримується.", 405, "CustomError"));
});

app.use(errorHandler);

const PORT = () => {
  if (process.env.NODE_ENV === "test") {
    return 6001;
  }
  return 6000;
};
  
const portValue = PORT()
app.listen(portValue, () => {
  console.log(`Run on PORT:${portValue}\n`)
});

