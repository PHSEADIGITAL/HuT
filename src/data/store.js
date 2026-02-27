const fs = require("fs/promises");
const { dbFilePath } = require("../config");

let inMemoryCache = null;
let writeQueue = Promise.resolve();

async function loadData() {
  if (inMemoryCache) {
    return inMemoryCache;
  }

  const raw = await fs.readFile(dbFilePath, "utf8");
  inMemoryCache = JSON.parse(raw);
  return inMemoryCache;
}

async function saveData(data) {
  await fs.writeFile(dbFilePath, JSON.stringify(data, null, 2));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function getSnapshot() {
  const data = await loadData();
  return clone(data);
}

async function withWriteLock(mutator) {
  const run = writeQueue.then(async () => {
    const data = await loadData();
    const result = await mutator(data);
    await saveData(data);
    return result;
  });

  writeQueue = run.catch(() => {});
  return run;
}

module.exports = {
  getSnapshot,
  withWriteLock
};
