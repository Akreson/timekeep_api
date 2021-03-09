class ErrorResponse extends Error {
  constructor(message, statusCode, name = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.name = name;
  }
}

module.exports = ErrorResponse;
