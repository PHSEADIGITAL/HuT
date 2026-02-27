const { randomUUID } = require("crypto");
const { hashPassword, verifyPassword } = require("./password");

function sanitizeUser(user) {
  if (!user) {
    return null;
  }
  const { passwordHash, ...rest } = user;
  return rest;
}

function findUserByEmail(data, email) {
  return data.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
}

function findUserByPhone(data, phone) {
  return data.users.find((user) => String(user.phone || "").trim() === String(phone || "").trim());
}

function findUserByIdentifier(data, identifier) {
  const cleaned = String(identifier || "").trim();
  if (!cleaned) {
    return null;
  }

  if (cleaned.includes("@")) {
    return findUserByEmail(data, cleaned.toLowerCase());
  }
  return findUserByPhone(data, cleaned);
}

function findUserById(data, userId) {
  return data.users.find((user) => user.id === userId);
}

function registerCustomer(data, { name, email, phone, password }) {
  if (findUserByEmail(data, email)) {
    return { error: "An account with this email already exists." };
  }

  const user = {
    id: randomUUID(),
    role: "customer",
    name,
    email: email.toLowerCase(),
    phone,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  data.users.push(user);
  return { user: sanitizeUser(user) };
}

function authenticateUser(data, email, password) {
  const user = findUserByEmail(data, email);
  if (!user) {
    return null;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return null;
  }

  return sanitizeUser(user);
}

function canAccessHotel(user, hotelId) {
  if (!user) {
    return false;
  }
  if (user.role === "platform_admin") {
    return true;
  }
  if (user.role !== "hotel_admin") {
    return false;
  }
  return Array.isArray(user.hotelIds) && user.hotelIds.includes(hotelId);
}

module.exports = {
  sanitizeUser,
  findUserByEmail,
  findUserByPhone,
  findUserByIdentifier,
  findUserById,
  registerCustomer,
  authenticateUser,
  canAccessHotel
};
