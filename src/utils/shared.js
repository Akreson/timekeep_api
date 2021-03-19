exports.concatArrayOfArrays = arraysToConcat => {
  return Array.prototype.concat.apply([], arraysToConcat);
}

exports.isObject = testElement => {
  return (typeof testElement === "object") && (testElement !== null);
}

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