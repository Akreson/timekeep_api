exports.concatArrayOfArrays = arraysToConcat => {
  return Array.prototype.concat.apply([], arraysToConcat);
}

exports.isObject = testElement => {
  return (typeof testElement === "object") && (testElement !== null);
}

exports.initArray = (count, value) => {
  const result = new Array(count);
  result.fill(value);
  return result;
}

exports.cloneObj = obj => {
  if ((obj === null) || typeof obj !== 'object')
    return obj;

  let result = null;
  if (obj instanceof Date) {
    result = new Date(obj);
  } else {
    result = obj.constructor();
  }

  for (const key in obj) {
    if(obj.hasOwnProperty(key)) {
      result[key] = this.cloneObj(obj[key]);
    }
  }

  return result;
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