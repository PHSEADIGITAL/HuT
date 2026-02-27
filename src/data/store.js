const fs = require("fs/promises");
const { dbFilePath } = require("../config");

let inMemoryCache = null;
let writeQueue = Promise.resolve();

function ensureDataShape(data) {
  if (!Array.isArray(data.bookings)) {
    data.bookings = [];
  }
  if (!Array.isArray(data.payments)) {
    data.payments = [];
  }
  if (!Array.isArray(data.notifications)) {
    data.notifications = [];
  }
  if (!Array.isArray(data.premiumSubscriptions)) {
    data.premiumSubscriptions = [];
  }
  if (!Array.isArray(data.fraudEvents)) {
    data.fraudEvents = [];
  }
  if (!Array.isArray(data.paymentSessions)) {
    data.paymentSessions = [];
  }
  if (!Array.isArray(data.users)) {
    data.users = [];
  }
}

async function loadData() {
  if (inMemoryCache) {
    return inMemoryCache;
  }

  const raw = await fs.readFile(dbFilePath, "utf8");
  inMemoryCache = JSON.parse(raw);
  ensureDataShape(inMemoryCache);
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
    ensureDataShape(data);
    await saveData(data);
    return result;
  });

  writeQueue = run.catch(() => {});
  return run;
}

module.exports = {
  getSnapshot,
  withWriteLock,
  resetCache: () => {
    inMemoryCache = null;
    writeQueue = Promise.resolve();
  }
};
