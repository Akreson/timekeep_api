exports.concatArrayOfArrays = arraysToConcat => {
  return Array.prototype.concat.apply([], arraysToConcat);
}

exports.isObject = testElement => {
  return (typeof testElement === "object") && (testElement !== null);
}


