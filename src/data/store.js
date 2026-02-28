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
  if (!Array.isArray(data.walletTopupIntents)) {
    data.walletTopupIntents = [];
  }
  if (!Array.isArray(data.paymentWebhookEvents)) {
    data.paymentWebhookEvents = [];
  }
  if (!Array.isArray(data.users)) {
    data.users = [];
  }
  if (!Array.isArray(data.marketplaceListings)) {
    data.marketplaceListings = [];
  }
  if (!Array.isArray(data.marketplaceUnlocks)) {
    data.marketplaceUnlocks = [];
  }
  if (!Array.isArray(data.walletTransactions)) {
    data.walletTransactions = [];
  }
  if (!Array.isArray(data.marketplaceSubscriptions)) {
    data.marketplaceSubscriptions = [];
  }
  if (!Array.isArray(data.passwordOtps)) {
    data.passwordOtps = [];
  }
  if (!Array.isArray(data.marketplaceSellerReviews)) {
    data.marketplaceSellerReviews = [];
  }
  if (!Array.isArray(data.hotelReviews)) {
    data.hotelReviews = [];
  }

  for (const payment of data.payments) {
    if (typeof payment.settled !== "boolean") {
      payment.settled = false;
    }
    if (payment.settlementBatchId === undefined) {
      payment.settlementBatchId = null;
    }
    if (payment.settledAt === undefined) {
      payment.settledAt = null;
    }
    if (!payment.paymentStatus) {
      payment.paymentStatus = "paid";
    }
  }

  for (const session of data.paymentSessions) {
    if (!session.sessionType) {
      session.sessionType = session.walletTopupId ? "wallet_topup" : "booking";
    }
  }

  for (const hotel of data.hotels || []) {
    if (hotel.paystackSubaccountCode === undefined) {
      hotel.paystackSubaccountCode = "";
    }
    if (hotel.flutterwaveSubaccountId === undefined) {
      hotel.flutterwaveSubaccountId = "";
    }
  }

  if (data.platform && typeof data.platform === "object") {
    if (!data.platform.collectionAccountAlias) {
      data.platform.collectionAccountAlias = "HuT Business Collection Account";
    }
  }

  for (const user of data.users) {
    if (!Number.isFinite(user.walletBalance)) {
      user.walletBalance = 0;
    }
    if (!Number.isFinite(user.marketplacePoints)) {
      user.marketplacePoints = 0;
    }
    if (!Number.isFinite(user.marketplacePaidUnlockCount)) {
      user.marketplacePaidUnlockCount = 0;
    }
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
