exports.concatArrayOfArrays = arraysToConcat => {
  return Array.prototype.concat.apply([], arraysToConcat);
}

exports.isObject = testElement => {
  return (typeof testElement === "object") && (testElement !== null);
}

exports.initArray = (count, value) => {
  return (new Array(count)).fill(value);
}

// ждет до следуйщего цикла nodejs
exports.setImmediatePromise = () => {
  return new Promise((resolve) => {
    setImmediate(() => resolve());
  });
}

exports.setTimeoutPromise = (time) => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), time);
  });
}