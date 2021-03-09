require("colors");

exports.logger = (req, res, next) => {
  if (process.env.NODE_ENV === "test") {
    return next();
  }
  if (
    req.url.includes("static") ||
    req.url.includes(".css") ||
    req.url.includes("favicon.ico")
  ) {
    return next();
  }
  console.log("");
  console.log("date".green, new Date().toLocaleString("uk-UK", {timeZone: "Europe/Kiev"}).blue);
  console.log("Method".green, req.method.blue);
  console.log("URL".green, req.url.blue);
  console.log(
    "User-agent".green,
    req.headers["user-agent"] && req.headers["user-agent"].blue
  );
  if (req.method === "POST" || req.method === "PUT") {
    console.log("body".yellow, req.body);
  } else {
    console.log("query".yellow, req.query);
  }

  next();
};
