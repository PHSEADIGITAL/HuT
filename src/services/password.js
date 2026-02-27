const { randomBytes, scryptSync, timingSafeEqual } = require("crypto");

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, salt, hashed] = parts;
  const candidate = scryptSync(password, salt, 64);
  const actual = Buffer.from(hashed, "hex");
  if (candidate.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(candidate, actual);
}

module.exports = {
  hashPassword,
  verifyPassword
};
