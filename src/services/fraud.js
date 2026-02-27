const { fraud: fraudConfig } = require("../config");

const disposableDomains = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com"
]);

function sameIdentityWithinWindow(data, email, phone) {
  const now = Date.now();
  const windowMs = fraudConfig.velocityWindowMinutes * 60 * 1000;

  return data.bookings.filter((booking) => {
    if (!booking.createdAt) {
      return false;
    }

    const createdAtMs = new Date(booking.createdAt).getTime();
    if (now - createdAtMs > windowMs) {
      return false;
    }

    return booking.email === email || booking.phone === phone;
  }).length;
}

function assessFraudRisk({ data, bookingInput, amount }) {
  let score = 0;
  const flags = [];

  const repeatCount = sameIdentityWithinWindow(
    data,
    bookingInput.email,
    bookingInput.phone
  );
  if (repeatCount >= fraudConfig.velocityMaxCount) {
    score += 40;
    flags.push("High booking velocity detected for same email/phone.");
  }

  if (amount >= fraudConfig.highValueNaira) {
    score += 25;
    flags.push("High-value transaction threshold reached.");
  }

  const emailDomain = (bookingInput.email.split("@")[1] || "").toLowerCase();
  if (disposableDomains.has(emailDomain)) {
    score += 25;
    flags.push("Disposable email domain detected.");
  }

  if (!/^(\+?234|0)[789][01]\d{8}$/.test(bookingInput.phone)) {
    score += 15;
    flags.push("Phone number does not match expected Nigerian mobile format.");
  }

  const checkInDate = new Date(`${bookingInput.checkInDate}T00:00:00.000Z`);
  const hoursToCheckIn = (checkInDate.getTime() - Date.now()) / (1000 * 60 * 60);
  if (hoursToCheckIn <= 6) {
    score += 20;
    flags.push("Same-day, short-notice booking.");
  }

  const blocked = score >= fraudConfig.blockThreshold;
  const reviewNeeded = score >= fraudConfig.reviewThreshold;

  return {
    score,
    flags,
    blocked,
    reviewNeeded
  };
}

module.exports = {
  assessFraudRisk
};
