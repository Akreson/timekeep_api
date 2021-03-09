exports.errorHandler = (err, req, res, next) => {
  switch (err.name) {
    case "ValidationError":
    case "ProtectedError":
    case "CustomError":
      if (process.env.NODE_ENV !== "test") {
        console.log("Error".red, err.message);
      }
      return res.status(err.statusCode).json({
        error: true,
        errorDesc: err.message
      });
    default:
      if (process.env.NODE_ENV !== "test") {
        console.log("Error", err);
      }
      return res.status(500).json({
        error: true,
        errorDesc: "Щось пішло не так, спробуйте пізніше!"
      });
  }
};
