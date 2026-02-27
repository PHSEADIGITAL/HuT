require("dotenv").config();

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const {
  appName,
  baseUrl,
  nodeEnv,
  session: sessionConfig,
  auth: authConfig
} = require("./config");
const { getSnapshot, withWriteLock } = require("./data/store");
const {
  validateStayDates,
  hotelAvailability,
  assertRoomAvailable
} = require("./services/availability");
const { calculateBookingPrice, getSmartPricingInsights } = require("./services/pricing");
const { assessFraudRisk } = require("./services/fraud");
const { calculateRefund, getRefundPolicyRules } = require("./services/refund");
const {
  sendBookingAcknowledgements,
  sendCancellationAcknowledgements
} = require("./services/notifications");
const { registerSubscriber, broadcast } = require("./services/realtime");
const { formatNaira, formatPercent } = require("./services/format");
const { initializePayment, verifyPayment } = require("./services/providers/paymentProvider");
const {
  sanitizeUser,
  findUserById,
  findUserByIdentifier,
  registerCustomer,
  authenticateUser,
  canAccessHotel
} = require("./services/users");
const { hashPassword } = require("./services/password");
const { sendSms } = require("./services/providers/smsProvider");
const { sendEmail } = require("./services/providers/emailProvider");

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isoDateOffset(daysFromToday) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function sortHotelsForMarketplace(hotels) {
  return [...hotels].sort((a, b) => {
    if (a.premiumListingActive !== b.premiumListingActive) {
      return a.premiumListingActive ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function setFlash(request, type, message) {
  request.session.flash = { type, message };
}

function getCallbackBaseUrl(request) {
  if (baseUrl) {
    return baseUrl;
  }
  return `${request.protocol}://${request.get("host")}`;
}

function safeNextPath(value) {
  if (typeof value !== "string") {
    return "/";
  }
  return value.startsWith("/") ? value : "/";
}

const hotelFallbackImages = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1600&q=80"
];

const roomFallbackImages = [
  "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1616594039964-3f2b6f326f80?auto=format&fit=crop&w=1400&q=80",
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=80"
];

function numericSeed(value) {
  const text = String(value || "");
  let seed = 0;
  for (let index = 0; index < text.length; index += 1) {
    seed += text.charCodeAt(index);
  }
  return seed;
}

function pickFallbackImage(collection, seedValue) {
  const seed = numericSeed(seedValue);
  return collection[seed % collection.length];
}

function normalizeImageArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function withHotelMedia(hotel) {
  const coverImage =
    (hotel.coverImage && String(hotel.coverImage).trim()) ||
    pickFallbackImage(hotelFallbackImages, hotel.id);
  const configuredGallery = normalizeImageArray(hotel.galleryImages);
  const galleryImages = configuredGallery.length
    ? configuredGallery
    : [
        coverImage,
        pickFallbackImage(hotelFallbackImages, `${hotel.id}-a`),
        pickFallbackImage(hotelFallbackImages, `${hotel.id}-b`)
      ];

  return {
    ...hotel,
    coverImage,
    galleryImages
  };
}

function withRoomMedia(room) {
  const image =
    (room.image && String(room.image).trim()) ||
    pickFallbackImage(roomFallbackImages, room.id);
  const galleryImages = normalizeImageArray(room.galleryImages);
  return {
    ...room,
    image,
    galleryImages: galleryImages.length ? galleryImages : [image]
  };
}

const propertyTypeOptions = [
  "Hotel",
  "Resort",
  "Serviced Apartment",
  "Boutique Hotel"
];

const fallbackAmenities = [
  ["Free WiFi", "Breakfast included", "Airport pickup"],
  ["Sea view", "Swimming pool", "24/7 front desk"],
  ["Family rooms", "Restaurant", "Free parking"],
  ["Business lounge", "Conference room", "Smart TV"]
];

function reviewLabelFromScore(score) {
  if (score >= 9) {
    return "Superb";
  }
  if (score >= 8.3) {
    return "Very good";
  }
  if (score >= 7.5) {
    return "Good";
  }
  return "Pleasant";
}

function withHotelListingMeta(hotel) {
  const seed = numericSeed(hotel.id);
  const starRating = hotel.starRating || Math.min(5, 3 + (seed % 3));
  const reviewScore =
    hotel.reviewScore ||
    Number((7.4 + ((seed % 18) / 10)).toFixed(1));
  const reviewCount = hotel.reviewCount || 120 + (seed % 980);
  const distanceToCenterKm =
    hotel.distanceToCenterKm ||
    Number((0.5 + ((seed % 24) / 10)).toFixed(1));
  const propertyType =
    hotel.propertyType || propertyTypeOptions[seed % propertyTypeOptions.length];
  const amenityFallback = fallbackAmenities[seed % fallbackAmenities.length];
  const amenities = Array.isArray(hotel.amenities) && hotel.amenities.length
    ? hotel.amenities
    : amenityFallback;

  return {
    ...hotel,
    starRating,
    reviewScore,
    reviewCount,
    reviewLabel: reviewLabelFromScore(reviewScore),
    distanceToCenterKm,
    propertyType,
    amenities
  };
}

function withRoomDisplayMeta(room) {
  const seed = numericSeed(room.id);
  const sleeps = room.sleeps || 2 + (seed % 3);
  const roomSizeSqm = room.roomSizeSqm || 18 + (seed % 15);
  const bedTypes = [
    "1 king bed",
    "1 queen bed",
    "2 twin beds",
    "1 king bed + sofa bed"
  ];
  const bedType = room.bedType || bedTypes[seed % bedTypes.length];
  const highlights = Array.isArray(room.highlights) && room.highlights.length
    ? room.highlights
    : ["Free cancellation option", "Breakfast available", "Pay online"];

  return {
    ...room,
    sleeps,
    roomSizeSqm,
    bedType,
    highlights
  };
}

const marketplaceListingLimitPerMonth = 4;
const contactUnlockFeeNaira = 200;
const passwordOtpExpiryMinutes = 10;
const marketplaceUploadDir = path.join(
  __dirname,
  "..",
  "public",
  "uploads",
  "marketplace"
);
const marketplaceFallbackImage =
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80";
const marketplaceCategories = [
  "Electronics",
  "Furniture",
  "Fashion",
  "Gaming",
  "Mobile Phones",
  "Computers",
  "Appliances",
  "Home & Kitchen",
  "Kids",
  "Sports",
  "Vehicles",
  "Other"
];
const marketplaceConditions = ["Used", "Like New", "Refurbished"];
const marketplacePlans = [
  {
    id: "basic",
    name: "Basic Plan",
    amount: 2000,
    extraListings: 6,
    description: "Increase monthly limit by 6 listings."
  },
  {
    id: "premium",
    name: "Premium Plan",
    amount: 5000,
    extraListings: 21,
    description: "Increase monthly limit by 21 listings."
  }
];

fs.mkdirSync(marketplaceUploadDir, { recursive: true });

const marketplaceUpload = multer({
  storage: multer.diskStorage({
    destination: (request, file, callback) => {
      callback(null, marketplaceUploadDir);
    },
    filename: (request, file, callback) => {
      const extension = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      callback(null, `${Date.now()}-${randomUUID()}${extension}`);
    }
  }),
  limits: {
    files: 4,
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (request, file, callback) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      callback(new Error("Only image uploads are supported."));
      return;
    }
    callback(null, true);
  }
});

function toMonthKey(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function maskPhone(phone) {
  const text = String(phone || "").trim();
  if (!text) {
    return "Hidden";
  }
  if (text.length <= 6) {
    return `${text.slice(0, 2)}****`;
  }
  return `${text.slice(0, 4)}****${text.slice(-2)}`;
}

function sanitizeMarketplaceText(value, fallback = "") {
  return String(value || fallback).trim();
}

function normalizeMarketplaceCategory(value) {
  const input = sanitizeMarketplaceText(value, "Other");
  return marketplaceCategories.includes(input) ? input : "Other";
}

function normalizeMarketplaceCondition(value) {
  const input = sanitizeMarketplaceText(value, "Used");
  return marketplaceConditions.includes(input) ? input : "Used";
}

function ensureUserWallet(user) {
  if (!user) {
    return;
  }
  if (!Number.isFinite(user.walletBalance)) {
    user.walletBalance = 0;
  }
}

function createWalletEntry(data, {
  userId,
  type,
  direction,
  amount,
  description,
  reference,
  relatedListingId = null,
  relatedPaymentId = null
}) {
  const user = data.users.find((item) => item.id === userId);
  if (!user) {
    return { error: "Wallet owner not found." };
  }

  ensureUserWallet(user);
  const signedAmount = direction === "debit" ? -Math.abs(amount) : Math.abs(amount);
  const nextBalance = user.walletBalance + signedAmount;
  if (nextBalance < 0) {
    return { error: "Insufficient wallet balance." };
  }

  user.walletBalance = Number(nextBalance.toFixed(2));

  const entry = {
    id: randomUUID(),
    userId,
    type,
    direction,
    amount: Math.abs(amount),
    signedAmount,
    description,
    reference,
    relatedListingId,
    relatedPaymentId,
    balanceAfter: user.walletBalance,
    createdAt: new Date().toISOString()
  };
  data.walletTransactions.push(entry);
  return { entry, balanceAfter: user.walletBalance };
}

function countMonthlyListings(data, userId, monthKey) {
  return data.marketplaceListings.filter(
    (listing) => listing.sellerUserId === userId && listing.monthKey === monthKey
  ).length;
}

function getMarketplacePlanById(planId) {
  return marketplacePlans.find((plan) => plan.id === planId) || null;
}

function getMonthlyPlanExtraListings(data, userId, monthKey) {
  return data.marketplaceSubscriptions
    .filter(
      (subscription) =>
        subscription.userId === userId &&
        subscription.monthKey === monthKey &&
        subscription.status === "active"
    )
    .reduce((sum, subscription) => sum + (subscription.extraListings || 0), 0);
}

function canCreateMarketplaceListing(data, userId, dateValue = new Date()) {
  const monthKey = toMonthKey(dateValue);
  const used = countMonthlyListings(data, userId, monthKey);
  const extraListings = getMonthlyPlanExtraListings(data, userId, monthKey);
  const includedLimit = marketplaceListingLimitPerMonth + extraListings;
  return {
    used,
    includedLimit,
    extraListings,
    remaining: Math.max(0, includedLimit - used),
    monthKey,
    allowed: used < includedLimit
  };
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function isEmailIdentifier(value) {
  return String(value || "").includes("@");
}

function normalizeIdentifier(value) {
  const cleaned = sanitizeMarketplaceText(value, "");
  return isEmailIdentifier(cleaned) ? cleaned.toLowerCase() : cleaned;
}

function listingPrimaryImage(listing) {
  if (Array.isArray(listing.imageUrls) && listing.imageUrls.length) {
    return listing.imageUrls[0];
  }
  return marketplaceFallbackImage;
}

function enrichMarketplaceListing(data, listing) {
  const seller = data.users.find((user) => user.id === listing.sellerUserId);
  return {
    ...listing,
    primaryImage: listingPrimaryImage(listing),
    sellerName: seller ? seller.name : "Unknown seller",
    sellerPhoneMasked: seller ? maskPhone(seller.phone) : "Hidden"
  };
}

function hasUnlockedSellerContact(data, listingId, buyerUserId) {
  return data.marketplaceUnlocks.some(
    (unlock) => unlock.listingId === listingId && unlock.buyerUserId === buyerUserId
  );
}

async function dispatchPasswordOtp({ identifier, code }) {
  if (isEmailIdentifier(identifier)) {
    await sendEmail({
      to: identifier,
      subject: "Hut password reset OTP",
      text: `Your Hut password reset OTP is ${code}. It expires in ${passwordOtpExpiryMinutes} minutes.`
    });
    return "email";
  }

  await sendSms({
    to: identifier,
    body: `Hut OTP: ${code}. Expires in ${passwordOtpExpiryMinutes} mins.`
  });
  return "sms";
}

function canViewBooking(user, booking) {
  if (!user) {
    return false;
  }
  if (user.role === "platform_admin") {
    return true;
  }
  if (user.role === "hotel_admin") {
    return canAccessHotel(user, booking.hotelId);
  }
  return user.role === "customer" && user.id === booking.customerUserId;
}

function customerOwnsBooking(user, booking) {
  return user && user.role === "customer" && user.id === booking.customerUserId;
}

function requireAuth(request, response, next) {
  if (request.currentUser) {
    next();
    return;
  }

  const nextUrl = encodeURIComponent(request.originalUrl || "/");
  response.redirect(`/auth/login?next=${nextUrl}`);
}

function requireRoles(roles) {
  return (request, response, next) => {
    if (!request.currentUser) {
      const nextUrl = encodeURIComponent(request.originalUrl || "/");
      response.redirect(`/auth/login?next=${nextUrl}`);
      return;
    }

    if (!roles.includes(request.currentUser.role)) {
      response.status(403).render("error", {
        message: "You do not have permission to access this page.",
        platform: response.locals.platform
      });
      return;
    }

    next();
  };
}

function requireHotelAccess(request, response, next) {
  const hotelId = request.params.hotelId;
  if (canAccessHotel(request.currentUser, hotelId)) {
    next();
    return;
  }

  response.status(403).render("error", {
    message: "You do not have access to this hotel dashboard.",
    platform: response.locals.platform
  });
}

async function markBookingAsPaid({
  data,
  booking,
  hotel,
  paymentProvider,
  transactionReference,
  externalId
}) {
  if (booking.paymentStatus === "paid") {
    return;
  }

  booking.status = "confirmed";
  booking.paymentStatus = "paid";
  booking.paymentProvider = paymentProvider;
  booking.paymentReference = transactionReference;
  booking.paymentExternalId = externalId || transactionReference;
  booking.paidAt = new Date().toISOString();

  data.payments.push({
    id: randomUUID(),
    bookingId: booking.id,
    hotelId: hotel.id,
    userId: booking.customerUserId || null,
    listingId: null,
    transactionRef: transactionReference,
    transactionType: "booking_payment",
    paymentProvider,
    paymentExternalId: externalId || transactionReference,
    grossAmount: booking.pricing.totalPaid,
    hotelPayout: booking.pricing.hotelPayout,
    platformEarning: booking.pricing.platformRevenue,
    commissionRate: booking.pricing.commissionRateApplied,
    hotelBankAccount: hotel.bankAccount,
    platformBankAccount: data.platform.bankAccount,
    createdAt: booking.paidAt
  });

  await sendBookingAcknowledgements({
    data,
    booking,
    hotel
  });

  broadcast("availability_update", {
    hotelId: hotel.id,
    bookingId: booking.id,
    updatedAt: new Date().toISOString()
  });
}

function createApp() {
  const app = express();

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use(
    session({
      name: "hut.sid",
      secret: sessionConfig.secret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: sessionConfig.secureCookie,
        maxAge: 1000 * 60 * 60 * 24 * 7
      }
    })
  );

  app.locals.formatNaira = formatNaira;
  app.locals.formatPercent = formatPercent;
  app.locals.appName = appName;

  app.use(async (request, response, next) => {
    try {
      const snapshot = await getSnapshot();
      const userId = request.session.userId;
      const user = userId ? sanitizeUser(findUserById(snapshot, userId)) : null;

      request.currentUser = user;
      response.locals.currentUser = user;
      response.locals.currentPath = request.path || "/";
      response.locals.platform = snapshot.platform;
      response.locals.flash = request.session.flash || null;
      delete request.session.flash;
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get("/health", (request, response) => {
    response.json({
      ok: true,
      app: appName,
      env: nodeEnv,
      ts: new Date().toISOString()
    });
  });

  app.get("/auth/register", (request, response) => {
    if (request.currentUser) {
      response.redirect("/");
      return;
    }

    response.render("auth-register", {
      title: "Create account",
      next: safeNextPath(request.query.next || "/")
    });
  });

  app.post("/auth/register", async (request, response) => {
    const nextUrl = safeNextPath(String(request.body.next || "/"));
    const name = String(request.body.name || "").trim();
    const email = String(request.body.email || "").trim().toLowerCase();
    const phone = String(request.body.phone || "").trim();
    const password = String(request.body.password || "");
    const confirmPassword = String(request.body.confirmPassword || "");

    if (!name || !email || !phone || !password) {
      setFlash(request, "error", "All fields are required.");
      response.redirect(`/auth/register?next=${encodeURIComponent(nextUrl)}`);
      return;
    }

    if (password.length < authConfig.minimumPasswordLength) {
      setFlash(
        request,
        "error",
        `Password must be at least ${authConfig.minimumPasswordLength} characters.`
      );
      response.redirect(`/auth/register?next=${encodeURIComponent(nextUrl)}`);
      return;
    }

    if (password !== confirmPassword) {
      setFlash(request, "error", "Password confirmation does not match.");
      response.redirect(`/auth/register?next=${encodeURIComponent(nextUrl)}`);
      return;
    }

    const result = await withWriteLock(async (data) => {
      return registerCustomer(data, {
        name,
        email,
        phone,
        password
      });
    });

    if (result.error) {
      setFlash(request, "error", result.error);
      response.redirect(`/auth/register?next=${encodeURIComponent(nextUrl)}`);
      return;
    }

    request.session.userId = result.user.id;
    setFlash(request, "success", "Welcome to Hut! Your account is ready.");
    response.redirect(nextUrl);
  });

  app.get("/auth/login", (request, response) => {
    if (request.currentUser) {
      response.redirect("/");
      return;
    }

    response.render("auth-login", {
      title: "Sign in",
      next: safeNextPath(request.query.next || "/")
    });
  });

  app.post("/auth/login", async (request, response) => {
    const nextUrl = safeNextPath(String(request.body.next || "/"));
    const email = String(request.body.email || "").trim().toLowerCase();
    const password = String(request.body.password || "");
    const snapshot = await getSnapshot();
    const user = authenticateUser(snapshot, email, password);

    if (!user) {
      setFlash(request, "error", "Invalid email or password.");
      response.redirect(`/auth/login?next=${encodeURIComponent(nextUrl)}`);
      return;
    }

    request.session.userId = user.id;
    setFlash(request, "success", "Logged in successfully.");
    response.redirect(nextUrl);
  });

  app.get("/auth/forgot-password", (request, response) => {
    if (request.currentUser) {
      response.redirect("/");
      return;
    }

    response.render("auth-forgot-password", {
      identifier: sanitizeMarketplaceText(request.query.identifier, "")
    });
  });

  app.post("/auth/forgot-password", async (request, response) => {
    const identifier = normalizeIdentifier(request.body.identifier);
    if (!identifier) {
      setFlash(request, "error", "Provide your email or phone number.");
      response.redirect("/auth/forgot-password");
      return;
    }

    const otpSeedResult = await withWriteLock(async (data) => {
      const user = findUserByIdentifier(data, identifier);
      if (!user) {
        return { userFound: false };
      }

      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      data.passwordOtps
        .filter((otp) => otp.userId === user.id && otp.status === "active" && !otp.consumedAt)
        .forEach((otp) => {
          otp.status = "replaced";
          otp.consumedAt = nowIso;
        });

      const otpCode = generateOtpCode();
      const otp = {
        id: randomUUID(),
        userId: user.id,
        identifier,
        channel: isEmailIdentifier(identifier) ? "email" : "sms",
        code: otpCode,
        status: "active",
        attempts: 0,
        expiresAt: new Date(now + passwordOtpExpiryMinutes * 60 * 1000).toISOString(),
        createdAt: nowIso
      };
      data.passwordOtps.push(otp);
      return { userFound: true, otp };
    });

    if (otpSeedResult.userFound && otpSeedResult.otp) {
      try {
        await dispatchPasswordOtp({
          identifier,
          code: otpSeedResult.otp.code
        });
      } catch (error) {
        setFlash(
          request,
          "error",
          "Unable to deliver OTP right now. Please try again shortly."
        );
        response.redirect(`/auth/forgot-password?identifier=${encodeURIComponent(identifier)}`);
        return;
      }
    }

    setFlash(
      request,
      "success",
      "If the account exists, an OTP has been sent. Proceed to reset password."
    );
    response.redirect(`/auth/reset-password?identifier=${encodeURIComponent(identifier)}`);
  });

  app.get("/auth/reset-password", (request, response) => {
    if (request.currentUser) {
      response.redirect("/");
      return;
    }

    response.render("auth-reset-password", {
      identifier: sanitizeMarketplaceText(request.query.identifier, "")
    });
  });

  app.post("/auth/reset-password", async (request, response) => {
    const identifier = normalizeIdentifier(request.body.identifier);
    const otpCode = sanitizeMarketplaceText(request.body.otpCode);
    const password = String(request.body.password || "");
    const confirmPassword = String(request.body.confirmPassword || "");

    if (!identifier || !otpCode || !password || !confirmPassword) {
      setFlash(request, "error", "All fields are required.");
      response.redirect(`/auth/reset-password?identifier=${encodeURIComponent(identifier)}`);
      return;
    }

    if (password.length < authConfig.minimumPasswordLength) {
      setFlash(
        request,
        "error",
        `Password must be at least ${authConfig.minimumPasswordLength} characters.`
      );
      response.redirect(`/auth/reset-password?identifier=${encodeURIComponent(identifier)}`);
      return;
    }

    if (password !== confirmPassword) {
      setFlash(request, "error", "Password confirmation does not match.");
      response.redirect(`/auth/reset-password?identifier=${encodeURIComponent(identifier)}`);
      return;
    }

    const result = await withWriteLock(async (data) => {
      const user = findUserByIdentifier(data, identifier);
      if (!user) {
        return { error: "Invalid OTP or account identifier." };
      }

      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const otpRecord = data.passwordOtps
        .filter(
          (otp) =>
            otp.userId === user.id &&
            otp.status === "active" &&
            !otp.consumedAt &&
            String(otp.code) === otpCode
        )
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

      if (!otpRecord) {
        return { error: "Invalid OTP or account identifier." };
      }

      otpRecord.attempts = (otpRecord.attempts || 0) + 1;
      if (new Date(otpRecord.expiresAt).getTime() < now) {
        otpRecord.status = "expired";
        otpRecord.consumedAt = nowIso;
        return { error: "OTP has expired. Request a new OTP." };
      }

      user.passwordHash = hashPassword(password);
      otpRecord.status = "used";
      otpRecord.consumedAt = nowIso;

      data.passwordOtps
        .filter((otp) => otp.userId === user.id && otp.id !== otpRecord.id && otp.status === "active")
        .forEach((otp) => {
          otp.status = "replaced";
          otp.consumedAt = nowIso;
        });

      return { ok: true };
    });

    if (result.error) {
      setFlash(request, "error", result.error);
      response.redirect(`/auth/reset-password?identifier=${encodeURIComponent(identifier)}`);
      return;
    }

    setFlash(request, "success", "Password updated successfully. You can sign in now.");
    response.redirect("/auth/login");
  });

  app.post("/auth/logout", (request, response) => {
    request.session.destroy(() => {
      response.redirect("/");
    });
  });

  app.get("/", async (request, response) => {
    const checkInDate = request.query.checkInDate || isoDateOffset(1);
    const checkOutDate = request.query.checkOutDate || isoDateOffset(2);
    const destination = String(request.query.destination || "Bonny Island").trim();
    const adults = Math.max(1, toNumber(request.query.adults, 2));
    const roomsRequested = Math.max(1, toNumber(request.query.rooms, 1));
    const minPriceFilter = Math.max(0, toNumber(request.query.minPrice, 0));
    const rawMaxPrice = toNumber(request.query.maxPrice, 0);
    const maxPriceFilter = rawMaxPrice > 0 ? rawMaxPrice : null;
    const sortByInput = String(request.query.sort || "recommended").trim();
    const sortBy = ["recommended", "price_asc", "price_desc", "rating_desc", "distance"]
      .includes(sortByInput)
      ? sortByInput
      : "recommended";

    const snapshot = await getSnapshot();

    let hotels = sortHotelsForMarketplace(snapshot.hotels).map((hotel) => {
      const hotelWithMedia = withHotelListingMeta(withHotelMedia(hotel));
      const rooms = snapshot.rooms.filter((room) => room.hotelId === hotel.id);
      const minPrice = rooms.reduce(
        (current, room) => Math.min(current, room.pricePerNight),
        Number.POSITIVE_INFINITY
      );
      const availability = hotelAvailability(snapshot, hotel.id, checkInDate, checkOutDate);
      const roomsAvailable = availability.reduce((sum, room) => sum + room.availableUnits, 0);
      const roomTypePreview = rooms.slice(0, 3).map((room) => room.category);
      return {
        ...hotelWithMedia,
        minPrice: Number.isFinite(minPrice) ? minPrice : 0,
        roomsAvailable,
        roomTypePreview
      };
    });

    const destinationQuery = destination.toLowerCase();
    hotels = hotels.filter((hotel) => {
      const searchable = [
        hotel.name,
        hotel.location,
        hotel.description,
        hotel.propertyType,
        ...(hotel.amenities || [])
      ]
        .join(" ")
        .toLowerCase();

      if (destinationQuery && !searchable.includes(destinationQuery)) {
        return false;
      }
      if (hotel.minPrice < minPriceFilter) {
        return false;
      }
      if (maxPriceFilter && hotel.minPrice > maxPriceFilter) {
        return false;
      }

      return true;
    });

    if (sortBy === "price_asc") {
      hotels.sort((a, b) => a.minPrice - b.minPrice);
    } else if (sortBy === "price_desc") {
      hotels.sort((a, b) => b.minPrice - a.minPrice);
    } else if (sortBy === "rating_desc") {
      hotels.sort((a, b) => b.reviewScore - a.reviewScore);
    } else if (sortBy === "distance") {
      hotels.sort((a, b) => a.distanceToCenterKm - b.distanceToCenterKm);
    } else {
      hotels.sort((a, b) => {
        const premiumBoost = Number(b.premiumListingActive) - Number(a.premiumListingActive);
        if (premiumBoost !== 0) {
          return premiumBoost;
        }
        return b.reviewScore - a.reviewScore;
      });
    }

    response.render("index", {
      hotels,
      checkInDate,
      checkOutDate,
      search: {
        destination,
        adults,
        rooms: roomsRequested,
        minPrice: minPriceFilter || "",
        maxPrice: maxPriceFilter || "",
        sortBy
      },
      resultStats: {
        count: hotels.length,
        total: snapshot.hotels.length
      },
      platform: snapshot.platform
    });
  });

  app.get("/hotels/:hotelId", async (request, response) => {
    const checkInDate = request.query.checkInDate || isoDateOffset(1);
    const checkOutDate = request.query.checkOutDate || isoDateOffset(2);
    const destination = String(request.query.destination || "Bonny Island").trim();
    const adults = Math.max(1, toNumber(request.query.adults, 2));
    const roomsRequested = Math.max(1, toNumber(request.query.rooms, 1));
    const snapshot = await getSnapshot();
    const hotel = snapshot.hotels.find((item) => item.id === request.params.hotelId);

    if (!hotel) {
      response.status(404).render("error", {
        message: "Hotel not found.",
        platform: snapshot.platform
      });
      return;
    }

    const hotelWithMedia = withHotelListingMeta(withHotelMedia(hotel));
    const rooms = snapshot.rooms
      .filter((room) => room.hotelId === hotel.id)
      .map((room) => withRoomDisplayMeta(withRoomMedia(room)));
    const minPrice = rooms.reduce(
      (current, room) => Math.min(current, room.pricePerNight),
      Number.POSITIVE_INFINITY
    );
    const availabilityByRoom = hotelAvailability(
      snapshot,
      hotel.id,
      checkInDate,
      checkOutDate
    );

    const roomCards = rooms.map((room) => ({
      ...room,
      availability: availabilityByRoom.find((a) => a.roomId === room.id)
    }));

    response.render("hotel", {
      hotel: {
        ...hotelWithMedia,
        minPrice: Number.isFinite(minPrice) ? minPrice : 0
      },
      rooms: roomCards,
      checkInDate,
      checkOutDate,
      search: {
        destination,
        adults,
        rooms: roomsRequested
      },
      cancellationRules: getRefundPolicyRules(hotel.cancellationPolicy),
      platform: snapshot.platform
    });
  });

  app.post("/bookings", requireRoles(["customer"]), async (request, response) => {
    const {
      hotelId,
      roomId,
      emergencyContactName,
      emergencyContactPhone,
      checkInDate,
      checkOutDate,
      guests,
      pickupRequested,
      specialRequest
    } = request.body;
    const callbackBaseUrl = getCallbackBaseUrl(request);

    const baseInput = {
      hotelId: String(hotelId || ""),
      roomId: String(roomId || ""),
      emergencyContactName: String(emergencyContactName || "").trim(),
      emergencyContactPhone: String(emergencyContactPhone || "").trim(),
      checkInDate: String(checkInDate || ""),
      checkOutDate: String(checkOutDate || ""),
      guests: Math.max(1, toNumber(guests, 1)),
      pickupRequested: pickupRequested === "on",
      specialRequest: String(specialRequest || "").trim()
    };

    if (
      !baseInput.hotelId ||
      !baseInput.roomId ||
      !baseInput.emergencyContactName ||
      !baseInput.emergencyContactPhone
    ) {
      response.status(400).render("error", {
        message: "Missing required booking information.",
        platform: response.locals.platform
      });
      return;
    }

    const dateValidation = validateStayDates(baseInput.checkInDate, baseInput.checkOutDate);
    if (!dateValidation.valid) {
      response.status(400).render("error", {
        message: dateValidation.reason,
        platform: response.locals.platform
      });
      return;
    }

    const result = await withWriteLock(async (data) => {
      const user = findUserById(data, request.currentUser.id);
      if (!user) {
        return { error: "Your account session is no longer valid. Please log in again." };
      }

      const hotel = data.hotels.find((item) => item.id === baseInput.hotelId);
      const room = data.rooms.find(
        (item) => item.id === baseInput.roomId && item.hotelId === baseInput.hotelId
      );
      if (!hotel || !room) {
        return { error: "Selected hotel/room no longer exists." };
      }

      const availabilityCheck = assertRoomAvailable(
        data,
        room,
        baseInput.checkInDate,
        baseInput.checkOutDate
      );
      if (!availabilityCheck.ok) {
        return { error: availabilityCheck.reason };
      }

      const pricing = calculateBookingPrice({
        roomPricePerNight: room.pricePerNight,
        nights: dateValidation.nights,
        commissionRate: hotel.commissionRate || data.platform.defaultCommissionRate,
        pickupRequested: baseInput.pickupRequested,
        pickupFee: hotel.pickupFee
      });

      const fraudAssessment = assessFraudRisk({
        data,
        bookingInput: {
          ...baseInput,
          email: user.email,
          phone: user.phone
        },
        amount: pricing.totalPaid
      });

      if (fraudAssessment.blocked) {
        data.fraudEvents.push({
          id: randomUUID(),
          hotelId: hotel.id,
          email: user.email,
          phone: user.phone,
          score: fraudAssessment.score,
          flags: fraudAssessment.flags,
          action: "blocked",
          createdAt: new Date().toISOString()
        });

        return {
          error:
            "Booking blocked by fraud protection. Contact support on WhatsApp for manual review."
        };
      }

      const booking = {
        id: randomUUID(),
        hotelId: hotel.id,
        roomId: room.id,
        roomCategory: room.category,
        customerUserId: user.id,
        customerName: user.name,
        email: user.email,
        phone: user.phone,
        emergencyContactName: baseInput.emergencyContactName,
        emergencyContactPhone: baseInput.emergencyContactPhone,
        checkInDate: baseInput.checkInDate,
        checkOutDate: baseInput.checkOutDate,
        nights: dateValidation.nights,
        guests: baseInput.guests,
        pickupRequested: baseInput.pickupRequested,
        specialRequest: baseInput.specialRequest,
        pricing,
        fraudScore: fraudAssessment.score,
        fraudFlags: fraudAssessment.flags,
        status: "pending_payment",
        paymentStatus: "pending",
        cancellationPolicy: hotel.cancellationPolicy,
        createdAt: new Date().toISOString()
      };
      data.bookings.push(booking);

      if (fraudAssessment.reviewNeeded) {
        data.fraudEvents.push({
          id: randomUUID(),
          hotelId: hotel.id,
          email: booking.email,
          phone: booking.phone,
          score: booking.fraudScore,
          flags: booking.fraudFlags,
          action: "review",
          createdAt: new Date().toISOString()
        });
      }

      try {
        const paymentInit = await initializePayment({
          bookingId: booking.id,
          amountNaira: booking.pricing.totalPaid,
          customerName: booking.customerName,
          email: booking.email,
          phone: booking.phone,
          callbackBaseUrl
        });

        data.paymentSessions.push({
          id: randomUUID(),
          bookingId: booking.id,
          provider: paymentInit.provider,
          reference: paymentInit.reference,
          paymentUrl: paymentInit.paymentUrl || null,
          status: paymentInit.status === "paid" ? "paid" : "pending",
          createdAt: new Date().toISOString()
        });

        if (paymentInit.status === "paid") {
          await markBookingAsPaid({
            data,
            booking,
            hotel,
            paymentProvider: paymentInit.provider,
            transactionReference: paymentInit.reference,
            externalId: paymentInit.reference
          });
          return {
            bookingId: booking.id,
            redirectType: "success"
          };
        }

        booking.paymentReference = paymentInit.reference;
        booking.paymentProvider = paymentInit.provider;
        return {
          bookingId: booking.id,
          redirectType: "payment",
          paymentUrl: paymentInit.paymentUrl
        };
      } catch (error) {
        booking.status = "payment_failed";
        booking.paymentStatus = "failed";
        booking.paymentError = error.message;
        return {
          error: "Unable to initialize payment. Please try again later."
        };
      }
    });

    if (result.error) {
      response.status(400).render("error", {
        message: result.error,
        platform: response.locals.platform
      });
      return;
    }

    if (result.redirectType === "payment") {
      response.redirect(`/bookings/${result.bookingId}/pay`);
      return;
    }

    response.redirect(`/bookings/${result.bookingId}/success`);
  });

  app.get("/bookings/:bookingId/pay", requireAuth, async (request, response) => {
    const snapshot = await getSnapshot();
    const booking = snapshot.bookings.find((item) => item.id === request.params.bookingId);
    if (!booking || !canViewBooking(request.currentUser, booking)) {
      response.status(404).render("error", {
        message: "Booking not found.",
        platform: snapshot.platform
      });
      return;
    }

    if (booking.paymentStatus === "paid") {
      response.redirect(`/bookings/${booking.id}/success`);
      return;
    }

    const sessionRecord = snapshot.paymentSessions.find(
      (item) => item.bookingId === booking.id && item.status === "pending"
    );
    response.render("booking-payment", {
      booking,
      paymentSession: sessionRecord || null,
      platform: snapshot.platform
    });
  });

  app.get("/payments/callback/:provider", async (request, response) => {
    const provider = String(request.params.provider || "").toLowerCase();
    const callbackReference =
      String(request.query.reference || request.query.tx_ref || "").trim();

    if (!callbackReference) {
      response.status(400).render("error", {
        message: "Missing payment reference in callback.",
        platform: response.locals.platform
      });
      return;
    }

    const result = await withWriteLock(async (data) => {
      const sessionRecord = data.paymentSessions.find(
        (item) =>
          item.provider === provider &&
          item.status === "pending" &&
          (item.reference === callbackReference || callbackReference.includes(item.reference))
      );
      if (!sessionRecord) {
        return { error: "Payment session not found for callback reference." };
      }

      const booking = data.bookings.find((item) => item.id === sessionRecord.bookingId);
      if (!booking) {
        return { error: "Booking linked to payment session not found." };
      }

      const hotel = data.hotels.find((item) => item.id === booking.hotelId);
      if (!hotel) {
        return { error: "Hotel linked to booking not found." };
      }

      if (booking.paymentStatus === "paid") {
        return { bookingId: booking.id };
      }

      try {
        const verification = await verifyPayment({
          provider,
          reference: sessionRecord.reference,
          callbackQuery: request.query
        });
        if (!verification.verified) {
          sessionRecord.status = "failed";
          booking.paymentStatus = "failed";
          booking.status = "payment_failed";
          return {
            error: "Payment verification failed. You can retry payment from your booking page."
          };
        }

        sessionRecord.status = "paid";
        sessionRecord.verifiedAt = new Date().toISOString();
        await markBookingAsPaid({
          data,
          booking,
          hotel,
          paymentProvider: sessionRecord.provider,
          transactionReference: sessionRecord.reference,
          externalId: verification.externalId
        });

        return { bookingId: booking.id };
      } catch (error) {
        sessionRecord.status = "failed";
        booking.paymentStatus = "failed";
        booking.status = "payment_failed";
        return {
          error: `Payment verification error: ${error.message}`
        };
      }
    });

    if (result.error) {
      response.status(400).render("error", {
        message: result.error,
        platform: response.locals.platform
      });
      return;
    }

    response.redirect(`/bookings/${result.bookingId}/success`);
  });

  app.get("/bookings/:bookingId/success", requireAuth, async (request, response) => {
    const snapshot = await getSnapshot();
    const booking = snapshot.bookings.find((item) => item.id === request.params.bookingId);

    if (!booking || !canViewBooking(request.currentUser, booking)) {
      response.status(404).render("error", {
        message: "Booking not found.",
        platform: snapshot.platform
      });
      return;
    }

    const hotel = snapshot.hotels.find((item) => item.id === booking.hotelId);
    const payment = snapshot.payments.find(
      (item) => item.bookingId === booking.id && item.transactionType === "booking_payment"
    );
    const notifications = snapshot.notifications.filter(
      (item) => item.bookingId === booking.id
    );

    response.render("booking-success", {
      booking,
      hotel,
      payment,
      notifications,
      refundRules: getRefundPolicyRules(booking.cancellationPolicy),
      platform: snapshot.platform
    });
  });

  app.get("/bookings/:bookingId/manage", requireRoles(["customer"]), async (request, response) => {
    const snapshot = await getSnapshot();
    const booking = snapshot.bookings.find((item) => item.id === request.params.bookingId);

    if (!booking || !customerOwnsBooking(request.currentUser, booking)) {
      response.status(404).render("error", {
        message: "Booking not found.",
        platform: snapshot.platform
      });
      return;
    }

    const hotel = snapshot.hotels.find((item) => item.id === booking.hotelId);
    const notifications = snapshot.notifications.filter(
      (item) => item.bookingId === booking.id
    );

    response.render("booking-manage", {
      booking,
      hotel,
      notifications,
      message: request.query.message || "",
      refundRules: getRefundPolicyRules(booking.cancellationPolicy),
      platform: snapshot.platform
    });
  });

  app.post(
    "/bookings/:bookingId/cancel",
    requireRoles(["customer"]),
    async (request, response) => {
      const bookingId = request.params.bookingId;
      const result = await withWriteLock(async (data) => {
        const booking = data.bookings.find((item) => item.id === bookingId);
        if (!booking || booking.customerUserId !== request.currentUser.id) {
          return { error: "Booking not found." };
        }

        if (booking.status === "cancelled") {
          return { error: "Booking has already been cancelled." };
        }

        if (booking.status !== "confirmed") {
          return { error: "Only confirmed bookings can be cancelled online." };
        }

        const hotel = data.hotels.find((item) => item.id === booking.hotelId);
        const cancelledAt = new Date().toISOString();
        const refund = calculateRefund({
          policyType: hotel.cancellationPolicy,
          cancelledAt,
          checkInDate: booking.checkInDate,
          totalPaid: booking.pricing.totalPaid,
          pickupTotal: booking.pricing.pickupTotal,
          pickupRequested: booking.pickupRequested
        });

        booking.status = "cancelled";
        booking.paymentStatus =
          refund.refundTotal >= booking.pricing.totalPaid
            ? "refunded"
            : refund.refundTotal > 0
            ? "partially_refunded"
            : "not_refundable";
        booking.cancelledAt = cancelledAt;
        booking.refund = refund;

        data.payments.push({
          id: randomUUID(),
          bookingId: booking.id,
          hotelId: booking.hotelId,
          userId: booking.customerUserId || null,
          listingId: null,
          transactionRef: `HUT-RFND-${Date.now()}`,
          transactionType: "refund",
          paymentProvider: booking.paymentProvider || "n/a",
          paymentExternalId: booking.paymentExternalId || booking.paymentReference || "n/a",
          grossAmount: -refund.refundTotal,
          hotelPayout: -Math.min(booking.pricing.hotelPayout, refund.refundTotal),
          platformEarning: -Math.max(0, refund.refundTotal - booking.pricing.hotelPayout),
          commissionRate: booking.pricing.commissionRateApplied,
          hotelBankAccount: hotel.bankAccount,
          platformBankAccount: data.platform.bankAccount,
          createdAt: cancelledAt
        });

        await sendCancellationAcknowledgements({
          data,
          booking,
          hotel,
          refund
        });

        broadcast("availability_update", {
          hotelId: booking.hotelId,
          bookingId: booking.id,
          updatedAt: new Date().toISOString()
        });

        return { ok: true };
      });

      const message = encodeURIComponent(
        result.error || "Booking cancelled successfully."
      );
      response.redirect(`/bookings/${bookingId}/manage?message=${message}`);
    }
  );

  app.get("/wallet", requireAuth, async (request, response) => {
    const snapshot = await getSnapshot();
    const user = snapshot.users.find((item) => item.id === request.currentUser.id);
    if (!user) {
      response.status(404).render("error", {
        message: "Wallet user not found.",
        platform: snapshot.platform
      });
      return;
    }

    ensureUserWallet(user);
    const transactions = snapshot.walletTransactions
      .filter((entry) => entry.userId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const unlocks = snapshot.marketplaceUnlocks
      .filter((unlock) => unlock.buyerUserId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const canTopUp = request.currentUser.role !== "hotel_admin";

    response.render("wallet", {
      walletUser: user,
      walletTransactions: transactions,
      unlocks,
      canTopUp,
      contactUnlockFeeNaira,
      platform: snapshot.platform
    });
  });

  app.post("/wallet/topup", requireAuth, async (request, response) => {
    if (request.currentUser.role === "hotel_admin") {
      setFlash(request, "error", "Hotel admins cannot credit virtual wallets.");
      response.redirect("/wallet");
      return;
    }

    const amount = Math.round(toNumber(request.body.amount, 0));
    const reference = sanitizeMarketplaceText(request.body.reference, `BANK-${Date.now()}`);

    if (amount <= 0) {
      setFlash(request, "error", "Top-up amount must be greater than zero.");
      response.redirect("/wallet");
      return;
    }

    const result = await withWriteLock(async (data) => {
      const user = data.users.find((item) => item.id === request.currentUser.id);
      if (!user) {
        return { error: "Wallet user not found." };
      }

      const paymentId = randomUUID();
      const walletEntryResult = createWalletEntry(data, {
        userId: user.id,
        type: "wallet_topup",
        direction: "credit",
        amount,
        description: "Wallet top-up via transfer to platform account",
        reference,
        relatedPaymentId: paymentId
      });
      if (walletEntryResult.error) {
        return { error: walletEntryResult.error };
      }

      data.payments.push({
        id: paymentId,
        bookingId: null,
        hotelId: null,
        userId: user.id,
        listingId: null,
        transactionRef: `HUT-WTOP-${Date.now()}`,
        transactionType: "wallet_topup",
        paymentProvider: "bank_transfer",
        paymentExternalId: reference,
        grossAmount: amount,
        hotelPayout: 0,
        platformEarning: 0,
        commissionRate: 0,
        hotelBankAccount: null,
        platformBankAccount: data.platform.bankAccount,
        createdAt: new Date().toISOString()
      });

      return { balanceAfter: walletEntryResult.balanceAfter };
    });

    if (result.error) {
      setFlash(request, "error", result.error);
      response.redirect("/wallet");
      return;
    }

    setFlash(
      request,
      "success",
      `Wallet funded successfully. New balance: ${formatNaira(result.balanceAfter)}`
    );
    response.redirect("/wallet");
  });

  app.get("/marketplace", async (request, response) => {
    const snapshot = await getSnapshot();
    const query = sanitizeMarketplaceText(request.query.q, "");
    const rawCategory = sanitizeMarketplaceText(request.query.category, "");
    const rawCondition = sanitizeMarketplaceText(request.query.condition, "");
    const category = marketplaceCategories.includes(rawCategory) ? rawCategory : "";
    const condition = marketplaceConditions.includes(rawCondition) ? rawCondition : "";
    const minPrice = Math.max(0, toNumber(request.query.minPrice, 0));
    const maxPriceRaw = toNumber(request.query.maxPrice, 0);
    const maxPrice = maxPriceRaw > 0 ? maxPriceRaw : null;
    const sortInput = sanitizeMarketplaceText(request.query.sort, "newest");
    const sort = ["newest", "price_asc", "price_desc"].includes(sortInput)
      ? sortInput
      : "newest";

    let listings = snapshot.marketplaceListings
      .filter((item) => item.status === "active")
      .map((item) => enrichMarketplaceListing(snapshot, item));

    const searchableQuery = query.toLowerCase();
    if (searchableQuery) {
      listings = listings.filter((listing) =>
        `${listing.title} ${listing.description} ${listing.category}`
          .toLowerCase()
          .includes(searchableQuery)
      );
    }
    if (category) {
      listings = listings.filter((listing) => listing.category === category);
    }
    if (condition) {
      listings = listings.filter((listing) => listing.condition === condition);
    }
    if (minPrice > 0) {
      listings = listings.filter((listing) => listing.price >= minPrice);
    }
    if (maxPrice) {
      listings = listings.filter((listing) => listing.price <= maxPrice);
    }

    if (sort === "price_asc") {
      listings.sort((a, b) => a.price - b.price);
    } else if (sort === "price_desc") {
      listings.sort((a, b) => b.price - a.price);
    } else {
      listings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    let walletBalance = null;
    let limitState = null;
    let activePlanSubscriptions = [];
    if (request.currentUser) {
      const currentUser = snapshot.users.find((user) => user.id === request.currentUser.id);
      if (currentUser) {
        ensureUserWallet(currentUser);
        walletBalance = currentUser.walletBalance;
        limitState = canCreateMarketplaceListing(snapshot, currentUser.id);
        activePlanSubscriptions = snapshot.marketplaceSubscriptions
          .filter(
            (item) =>
              item.userId === currentUser.id &&
              item.monthKey === limitState.monthKey &&
              item.status === "active"
          )
          .map((item) => ({
            ...item,
            planName: getMarketplacePlanById(item.planId)?.name || item.planId
          }));
      }
    }

    response.render("marketplace-index", {
      listings,
      categories: marketplaceCategories,
      conditions: marketplaceConditions,
      filters: {
        q: query,
        category,
        condition,
        minPrice: minPrice || "",
        maxPrice: maxPrice || "",
        sort
      },
      walletBalance,
      marketplacePlans,
      limitState,
      activePlanSubscriptions,
      contactUnlockFeeNaira,
      platform: snapshot.platform
    });
  });

  app.get("/marketplace/new", requireAuth, async (request, response) => {
    const snapshot = await getSnapshot();
    const limitState = canCreateMarketplaceListing(snapshot, request.currentUser.id);
    const user = snapshot.users.find((item) => item.id === request.currentUser.id);
    if (user) {
      ensureUserWallet(user);
    }
    const activePlanSubscriptions = snapshot.marketplaceSubscriptions
      .filter(
        (item) =>
          item.userId === request.currentUser.id &&
          item.monthKey === limitState.monthKey &&
          item.status === "active"
      )
      .map((item) => ({
        ...item,
        planName: getMarketplacePlanById(item.planId)?.name || item.planId
      }));
    response.render("marketplace-new", {
      limitState,
      categories: marketplaceCategories,
      conditions: marketplaceConditions,
      marketplacePlans,
      activePlanSubscriptions,
      walletBalance: user ? user.walletBalance : 0,
      platform: snapshot.platform
    });
  });

  app.post("/marketplace/plans/purchase", requireAuth, async (request, response) => {
    const planId = sanitizeMarketplaceText(request.body.planId, "").toLowerCase();
    const plan = getMarketplacePlanById(planId);
    if (!plan) {
      setFlash(request, "error", "Selected listing plan does not exist.");
      response.redirect("/marketplace/new");
      return;
    }

    if (request.currentUser.role === "hotel_admin") {
      setFlash(
        request,
        "error",
        "Hotel admins cannot purchase marketplace listing plans."
      );
      response.redirect("/marketplace/new");
      return;
    }

    const result = await withWriteLock(async (data) => {
      const user = data.users.find((item) => item.id === request.currentUser.id);
      if (!user) {
        return { error: "User account not found." };
      }
      ensureUserWallet(user);
      if (user.walletBalance < plan.amount) {
        return {
          error: `Insufficient wallet balance. You need ${formatNaira(plan.amount)} to purchase this plan.`
        };
      }

      const monthKey = toMonthKey(new Date());
      const paymentId = randomUUID();
      const walletResult = createWalletEntry(data, {
        userId: user.id,
        type: "marketplace_plan_purchase",
        direction: "debit",
        amount: plan.amount,
        description: `${plan.name} purchase for listing limit increase`,
        reference: `PLAN-${plan.id.toUpperCase()}-${Date.now()}`,
        relatedPaymentId: paymentId
      });
      if (walletResult.error) {
        return { error: walletResult.error };
      }

      data.marketplaceSubscriptions.push({
        id: randomUUID(),
        userId: user.id,
        planId: plan.id,
        amount: plan.amount,
        extraListings: plan.extraListings,
        monthKey,
        status: "active",
        createdAt: new Date().toISOString()
      });

      data.payments.push({
        id: paymentId,
        bookingId: null,
        hotelId: null,
        userId: user.id,
        listingId: null,
        transactionRef: `HUT-MPLN-${Date.now()}`,
        transactionType: "marketplace_plan_purchase",
        paymentProvider: "wallet",
        paymentExternalId: `WALLET-${user.id}`,
        grossAmount: plan.amount,
        hotelPayout: 0,
        platformEarning: plan.amount,
        commissionRate: 0,
        hotelBankAccount: null,
        platformBankAccount: data.platform.bankAccount,
        createdAt: new Date().toISOString()
      });

      const nextLimitState = canCreateMarketplaceListing(data, user.id);
      return {
        ok: true,
        balanceAfter: walletResult.balanceAfter,
        nextLimitState
      };
    });

    if (result.error) {
      setFlash(request, "error", result.error);
      response.redirect("/marketplace/new");
      return;
    }

    setFlash(
      request,
      "success",
      `${plan.name} activated. New monthly listing limit: ${result.nextLimitState.includedLimit}.`
    );
    response.redirect("/marketplace/new");
  });

  app.post(
    "/marketplace/listings",
    requireAuth,
    marketplaceUpload.array("images", 4),
    async (request, response) => {
      const title = sanitizeMarketplaceText(request.body.title);
      const description = sanitizeMarketplaceText(request.body.description);
      const category = normalizeMarketplaceCategory(request.body.category);
      const condition = normalizeMarketplaceCondition(request.body.condition);
      const price = Math.max(0, Math.round(toNumber(request.body.price, 0)));
      const requestedImageUrls = normalizeImageArray(request.body.imageUrls);
      const uploadedImageUrls = (request.files || []).map(
        (file) => `/uploads/marketplace/${file.filename}`
      );
      const imageUrls = [...uploadedImageUrls, ...requestedImageUrls].slice(0, 6);

      if (!title || !description || price <= 0) {
        setFlash(request, "error", "Title, description, and valid price are required.");
        response.redirect("/marketplace/new");
        return;
      }

      const result = await withWriteLock(async (data) => {
        const seller = data.users.find((user) => user.id === request.currentUser.id);
        if (!seller) {
          return { error: "Seller account not found." };
        }

        const limitState = canCreateMarketplaceListing(data, seller.id);
        if (!limitState.allowed) {
          return {
            error: `Monthly listing limit reached. You can only create ${limitState.includedLimit} listings this month on your current plan.`
          };
        }

        const listing = {
          id: randomUUID(),
          sellerUserId: seller.id,
          title,
          description,
          category,
          condition,
          price,
          imageUrls: imageUrls.length ? imageUrls : [marketplaceFallbackImage],
          status: "active",
          monthKey: limitState.monthKey,
          createdAt: new Date().toISOString()
        };
        data.marketplaceListings.push(listing);
        return { listingId: listing.id };
      });

      if (result.error) {
        setFlash(request, "error", result.error);
        response.redirect("/marketplace/new");
        return;
      }

      setFlash(request, "success", "Item listed successfully on the marketplace.");
      response.redirect(`/marketplace/listings/${result.listingId}`);
    }
  );

  app.get("/marketplace/my-listings", requireAuth, async (request, response) => {
    const snapshot = await getSnapshot();
    const listings = snapshot.marketplaceListings
      .filter((item) => item.sellerUserId === request.currentUser.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((item) => enrichMarketplaceListing(snapshot, item));
    const limitState = canCreateMarketplaceListing(snapshot, request.currentUser.id);
    const user = snapshot.users.find((item) => item.id === request.currentUser.id);
    if (user) {
      ensureUserWallet(user);
    }
    const activePlanSubscriptions = snapshot.marketplaceSubscriptions
      .filter(
        (item) =>
          item.userId === request.currentUser.id &&
          item.monthKey === limitState.monthKey &&
          item.status === "active"
      )
      .map((item) => ({
        ...item,
        planName: getMarketplacePlanById(item.planId)?.name || item.planId
      }));
    response.render("marketplace-my-listings", {
      listings,
      limitState,
      marketplacePlans,
      activePlanSubscriptions,
      walletBalance: user ? user.walletBalance : 0,
      platform: snapshot.platform
    });
  });

  app.post("/marketplace/listings/:listingId/mark-sold", requireAuth, async (request, response) => {
    const listingId = request.params.listingId;
    const result = await withWriteLock(async (data) => {
      const listing = data.marketplaceListings.find((item) => item.id === listingId);
      if (!listing) {
        return { error: "Listing not found." };
      }
      if (listing.sellerUserId !== request.currentUser.id) {
        return { error: "Only the seller can update listing status." };
      }
      listing.status = "sold";
      listing.soldAt = new Date().toISOString();
      return { ok: true };
    });

    if (result.error) {
      setFlash(request, "error", result.error);
    } else {
      setFlash(request, "success", "Listing marked as sold.");
    }
    response.redirect("/marketplace/my-listings");
  });

  app.get("/marketplace/listings/:listingId", async (request, response) => {
    const snapshot = await getSnapshot();
    const listing = snapshot.marketplaceListings.find(
      (item) => item.id === request.params.listingId
    );
    if (!listing) {
      response.status(404).render("error", {
        message: "Marketplace listing not found.",
        platform: snapshot.platform
      });
      return;
    }

    const enrichedListing = enrichMarketplaceListing(snapshot, listing);
    const seller = snapshot.users.find((user) => user.id === listing.sellerUserId);
    const isSeller = request.currentUser && request.currentUser.id === listing.sellerUserId;
    const isPlatformAdmin =
      request.currentUser && request.currentUser.role === "platform_admin";
    const hasUnlocked =
      request.currentUser &&
      hasUnlockedSellerContact(snapshot, listing.id, request.currentUser.id);
    const canViewContact = Boolean(isSeller || isPlatformAdmin || hasUnlocked);
    const canUnlock = Boolean(
      request.currentUser &&
      !isSeller &&
      !isPlatformAdmin &&
      !hasUnlocked &&
      listing.status === "active"
    );

    let walletBalance = null;
    if (request.currentUser) {
      const currentUser = snapshot.users.find((user) => user.id === request.currentUser.id);
      if (currentUser) {
        ensureUserWallet(currentUser);
        walletBalance = currentUser.walletBalance;
      }
    }

    const relatedListings = snapshot.marketplaceListings
      .filter(
        (item) =>
          item.id !== listing.id &&
          item.status === "active" &&
          (item.category === listing.category || item.sellerUserId === listing.sellerUserId)
      )
      .slice(0, 6)
      .map((item) => enrichMarketplaceListing(snapshot, item));

    response.render("marketplace-detail", {
      listing: enrichedListing,
      seller,
      canViewContact,
      canUnlock,
      walletBalance,
      contactUnlockFeeNaira,
      relatedListings,
      platform: snapshot.platform
    });
  });

  app.post(
    "/marketplace/listings/:listingId/unlock-contact",
    requireAuth,
    async (request, response) => {
      const listingId = request.params.listingId;
      const result = await withWriteLock(async (data) => {
        const listing = data.marketplaceListings.find((item) => item.id === listingId);
        if (!listing || listing.status !== "active") {
          return { error: "Listing not available for contact unlock." };
        }

        if (listing.sellerUserId === request.currentUser.id) {
          return { error: "You already own this listing." };
        }

        const buyer = data.users.find((item) => item.id === request.currentUser.id);
        if (!buyer) {
          return { error: "Buyer account not found." };
        }
        ensureUserWallet(buyer);

        const existingUnlock = data.marketplaceUnlocks.find(
          (unlock) =>
            unlock.listingId === listingId && unlock.buyerUserId === request.currentUser.id
        );
        if (existingUnlock) {
          return { ok: true, alreadyUnlocked: true };
        }

        if (buyer.walletBalance < contactUnlockFeeNaira) {
          return {
            error: `Insufficient wallet balance. Fund your wallet with at least ${formatNaira(
              contactUnlockFeeNaira
            )}.`
          };
        }

        const paymentId = randomUUID();
        const walletResult = createWalletEntry(data, {
          userId: buyer.id,
          type: "contact_unlock",
          direction: "debit",
          amount: contactUnlockFeeNaira,
          description: "Marketplace seller contact unlock fee",
          reference: `UNLOCK-${listing.id.slice(0, 8)}-${Date.now()}`,
          relatedListingId: listing.id,
          relatedPaymentId: paymentId
        });
        if (walletResult.error) {
          return { error: walletResult.error };
        }

        data.marketplaceUnlocks.push({
          id: randomUUID(),
          listingId: listing.id,
          buyerUserId: buyer.id,
          sellerUserId: listing.sellerUserId,
          fee: contactUnlockFeeNaira,
          createdAt: new Date().toISOString()
        });

        data.payments.push({
          id: paymentId,
          bookingId: null,
          hotelId: null,
          userId: buyer.id,
          listingId: listing.id,
          transactionRef: `HUT-MKT-${Date.now()}`,
          transactionType: "marketplace_contact_unlock",
          paymentProvider: "wallet",
          paymentExternalId: `WALLET-${buyer.id}`,
          grossAmount: contactUnlockFeeNaira,
          hotelPayout: 0,
          platformEarning: contactUnlockFeeNaira,
          commissionRate: 0,
          hotelBankAccount: null,
          platformBankAccount: data.platform.bankAccount,
          createdAt: new Date().toISOString()
        });

        return { ok: true };
      });

      if (result.error) {
        setFlash(request, "error", result.error);
      } else if (result.alreadyUnlocked) {
        setFlash(request, "success", "Contact already unlocked for this listing.");
      } else {
        setFlash(request, "success", "Seller contact unlocked successfully.");
      }

      response.redirect(`/marketplace/listings/${listingId}`);
    }
  );

  app.get(
    "/admin/owner-dashboard",
    requireRoles(["platform_admin"]),
    async (request, response) => {
      const snapshot = await getSnapshot();
      const hotelMap = new Map(snapshot.hotels.map((hotel) => [hotel.id, hotel]));
      const userMap = new Map(snapshot.users.map((user) => [user.id, user]));

      const allPayments = [...snapshot.payments].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      const hotelTransactions = allPayments.filter((payment) => payment.hotelId);

      const commissionRevenue = allPayments
        .filter((payment) => payment.transactionType === "booking_payment")
        .reduce((sum, payment) => sum + payment.platformEarning, 0);
      const premiumRevenue = allPayments
        .filter((payment) => payment.transactionType === "premium_subscription")
        .reduce((sum, payment) => sum + payment.platformEarning, 0);
      const marketplaceRevenue = allPayments
        .filter((payment) => payment.transactionType === "marketplace_contact_unlock")
        .reduce((sum, payment) => sum + payment.platformEarning, 0);
      const marketplacePlanRevenue = allPayments
        .filter((payment) => payment.transactionType === "marketplace_plan_purchase")
        .reduce((sum, payment) => sum + payment.platformEarning, 0);
      const netPlatformRevenue = allPayments
        .filter((payment) => payment.transactionType !== "wallet_topup")
        .reduce((sum, payment) => sum + payment.platformEarning, 0);
      const grossHotelVolume = hotelTransactions.reduce(
        (sum, payment) => sum + payment.grossAmount,
        0
      );
      const totalHotelPayouts = hotelTransactions.reduce(
        (sum, payment) => sum + payment.hotelPayout,
        0
      );
      const walletLiability = snapshot.users.reduce(
        (sum, user) => sum + (Number.isFinite(user.walletBalance) ? user.walletBalance : 0),
        0
      );

      const paymentRows = allPayments.map((payment) => ({
        ...payment,
        hotelName: payment.hotelId ? (hotelMap.get(payment.hotelId)?.name || "Unknown hotel") : "-",
        userName: payment.userId ? (userMap.get(payment.userId)?.name || "Unknown user") : "-"
      }));

      response.render("admin-owner-dashboard", {
        summary: {
          paymentCount: allPayments.length,
          hotelTransactionCount: hotelTransactions.length,
          grossHotelVolume,
          totalHotelPayouts,
          commissionRevenue,
          premiumRevenue,
          marketplaceRevenue,
          marketplacePlanRevenue,
          netPlatformRevenue,
          walletLiability
        },
        paymentRows,
        platform: snapshot.platform
      });
    }
  );

  app.get(
    "/admin",
    requireRoles(["hotel_admin", "platform_admin"]),
    async (request, response) => {
      const snapshot = await getSnapshot();
      const visibleHotels =
        request.currentUser.role === "platform_admin"
          ? snapshot.hotels
          : snapshot.hotels.filter((hotel) => canAccessHotel(request.currentUser, hotel.id));

      const hotels = visibleHotels.map((hotel) => {
        const bookings = snapshot.bookings.filter((item) => item.hotelId === hotel.id);
        const payments = snapshot.payments.filter(
          (item) => item.hotelId === hotel.id && item.transactionType === "booking_payment"
        );
        const grossSales = payments.reduce((sum, payment) => sum + payment.grossAmount, 0);
        const platformRevenue = payments.reduce(
          (sum, payment) => sum + payment.platformEarning,
          0
        );
        return {
          ...hotel,
          bookingCount: bookings.length,
          grossSales,
          platformRevenue
        };
      });

      response.render("admin-index", {
        hotels: sortHotelsForMarketplace(hotels),
        platform: snapshot.platform
      });
    }
  );

  app.get(
    "/admin/hotels/new",
    requireRoles(["platform_admin"]),
    async (request, response) => {
      const snapshot = await getSnapshot();
      response.render("admin-hotel-new", {
        platform: snapshot.platform
      });
    }
  );

  app.post(
    "/admin/hotels",
    requireRoles(["platform_admin"]),
    async (request, response) => {
      const {
        name,
        description,
        location,
        bankName,
        bankAccount,
        cancellationPolicy,
        commissionRate,
        pickupFee,
        coverImage,
        galleryImages,
        premiumListingActive,
        adminName,
        adminEmail,
        adminPassword
      } = request.body;

      const result = await withWriteLock(async (data) => {
        const hotel = {
          id: `hotel-${String(name || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")}-${Date.now()}`,
          name: String(name || "").trim(),
          description: String(description || "").trim(),
          location: String(location || "").trim(),
          bankName: String(bankName || "").trim(),
          bankAccount: String(bankAccount || "").trim(),
          cancellationPolicy: String(cancellationPolicy || "flexible"),
          commissionRate: Math.max(0.05, toNumber(commissionRate, 12) / 100),
          premiumListingActive: premiumListingActive === "on",
          premiumListingExpiresAt:
            premiumListingActive === "on"
              ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
              : null,
          pickupFee: Math.max(0, toNumber(pickupFee, 0)),
          coverImage: String(coverImage || "").trim(),
          galleryImages: normalizeImageArray(galleryImages),
          createdAt: new Date().toISOString()
        };

        if (!hotel.name || !hotel.bankAccount || !hotel.bankName) {
          return { error: "Hotel name and bank details are required." };
        }

        const normalizedAdminEmail = String(adminEmail || "").trim().toLowerCase();
        const normalizedAdminPassword = String(adminPassword || "");
        const normalizedAdminName = String(adminName || "").trim();

        if (normalizedAdminEmail || normalizedAdminPassword || normalizedAdminName) {
          if (!normalizedAdminEmail || !normalizedAdminPassword || !normalizedAdminName) {
            return { error: "Provide full hotel admin account details or leave all blank." };
          }
          if (normalizedAdminPassword.length < authConfig.minimumPasswordLength) {
            return {
              error: `Admin password must be at least ${authConfig.minimumPasswordLength} characters.`
            };
          }
          const exists = data.users.some(
            (user) => user.email.toLowerCase() === normalizedAdminEmail
          );
          if (exists) {
            return { error: "Hotel admin email already exists." };
          }

          data.users.push({
            id: randomUUID(),
            role: "hotel_admin",
            name: normalizedAdminName,
            email: normalizedAdminEmail,
            phone: "",
            hotelIds: [hotel.id],
            passwordHash: hashPassword(normalizedAdminPassword),
            createdAt: new Date().toISOString()
          });
        }

        data.hotels.push(hotel);

        if (hotel.premiumListingActive) {
          data.premiumSubscriptions.push({
            id: randomUUID(),
            hotelId: hotel.id,
            amount: data.platform.premiumSubscriptionMonthlyFee,
            durationDays: 30,
            status: "active",
            startedAt: new Date().toISOString(),
            expiresAt: hotel.premiumListingExpiresAt
          });

          data.payments.push({
            id: randomUUID(),
            bookingId: null,
            hotelId: hotel.id,
            userId: request.currentUser.id,
            listingId: null,
            transactionRef: `HUT-PREM-${Date.now()}`,
            transactionType: "premium_subscription",
            paymentProvider: "manual",
            paymentExternalId: "manual",
            grossAmount: data.platform.premiumSubscriptionMonthlyFee,
            hotelPayout: 0,
            platformEarning: data.platform.premiumSubscriptionMonthlyFee,
            commissionRate: 0,
            hotelBankAccount: hotel.bankAccount,
            platformBankAccount: data.platform.bankAccount,
            createdAt: new Date().toISOString()
          });
        }

        return { hotelId: hotel.id };
      });

      if (result.error) {
        response.status(400).render("error", {
          message: result.error,
          platform: response.locals.platform
        });
        return;
      }

      response.redirect(`/admin/hotels/${result.hotelId}/dashboard`);
    }
  );

  app.post(
    "/admin/hotels/:hotelId/subscription/renew",
    requireRoles(["hotel_admin", "platform_admin"]),
    requireHotelAccess,
    async (request, response) => {
      const hotelId = request.params.hotelId;
      const result = await withWriteLock(async (data) => {
        const hotel = data.hotels.find((item) => item.id === hotelId);
        if (!hotel) {
          return { error: "Hotel not found." };
        }

        const now = Date.now();
        const existingExpiry = hotel.premiumListingExpiresAt
          ? new Date(hotel.premiumListingExpiresAt).getTime()
          : now;
        const nextStart = Math.max(existingExpiry, now);
        const newExpiry = new Date(nextStart + 30 * 24 * 60 * 60 * 1000).toISOString();

        hotel.premiumListingActive = true;
        hotel.premiumListingExpiresAt = newExpiry;

        data.premiumSubscriptions.push({
          id: randomUUID(),
          hotelId,
          amount: data.platform.premiumSubscriptionMonthlyFee,
          durationDays: 30,
          status: "active",
          startedAt: new Date().toISOString(),
          expiresAt: newExpiry
        });

        data.payments.push({
          id: randomUUID(),
          bookingId: null,
          hotelId,
          userId: request.currentUser.id,
          listingId: null,
          transactionRef: `HUT-PREM-${Date.now()}`,
          transactionType: "premium_subscription",
          paymentProvider: "manual",
          paymentExternalId: "manual",
          grossAmount: data.platform.premiumSubscriptionMonthlyFee,
          hotelPayout: 0,
          platformEarning: data.platform.premiumSubscriptionMonthlyFee,
          commissionRate: 0,
          hotelBankAccount: hotel.bankAccount,
          platformBankAccount: data.platform.bankAccount,
          createdAt: new Date().toISOString()
        });

        return { ok: true };
      });

      if (result.error) {
        response.status(404).render("error", {
          message: result.error,
          platform: response.locals.platform
        });
        return;
      }

      response.redirect(`/admin/hotels/${hotelId}/dashboard`);
    }
  );

  app.get(
    "/admin/hotels/:hotelId/dashboard",
    requireRoles(["hotel_admin", "platform_admin"]),
    requireHotelAccess,
    async (request, response) => {
      const checkInDate = request.query.checkInDate || isoDateOffset(1);
      const checkOutDate = request.query.checkOutDate || isoDateOffset(2);
      const snapshot = await getSnapshot();
      const hotel = snapshot.hotels.find((item) => item.id === request.params.hotelId);

      if (!hotel) {
        response.status(404).render("error", {
          message: "Hotel not found.",
          platform: snapshot.platform
        });
        return;
      }

      const rooms = snapshot.rooms.filter((room) => room.hotelId === hotel.id);
      const bookings = snapshot.bookings
        .filter((booking) => booking.hotelId === hotel.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const payments = snapshot.payments
        .filter((payment) => payment.hotelId === hotel.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const availability = hotelAvailability(snapshot, hotel.id, checkInDate, checkOutDate);
      const pricingInsights = getSmartPricingInsights({
        data: snapshot,
        hotelId: hotel.id
      });

      const bookingPayments = payments.filter(
        (item) => item.transactionType === "booking_payment"
      );
      const grossSales = bookingPayments.reduce(
        (sum, payment) => sum + payment.grossAmount,
        0
      );
      const platformRevenue = bookingPayments.reduce(
        (sum, payment) => sum + payment.platformEarning,
        0
      );
      const hotelReceivables = bookingPayments.reduce(
        (sum, payment) => sum + payment.hotelPayout,
        0
      );

      response.render("admin-dashboard", {
        hotel,
        rooms,
        bookings,
        payments,
        availability,
        pricingInsights,
        grossSales,
        platformRevenue,
        hotelReceivables,
        checkInDate,
        checkOutDate,
        platform: snapshot.platform
      });
    }
  );

  app.get("/api/hotels/:hotelId/availability", async (request, response) => {
    const checkInDate = request.query.checkInDate || isoDateOffset(1);
    const checkOutDate = request.query.checkOutDate || isoDateOffset(2);
    const snapshot = await getSnapshot();
    const hotel = snapshot.hotels.find((item) => item.id === request.params.hotelId);

    if (!hotel) {
      response.status(404).json({ error: "Hotel not found." });
      return;
    }

    const availability = hotelAvailability(snapshot, hotel.id, checkInDate, checkOutDate);
    response.json({
      hotelId: hotel.id,
      checkInDate,
      checkOutDate,
      rooms: availability
    });
  });

  app.get("/api/hotels/:hotelId/availability/stream", (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    registerSubscriber(response);
    response.write(`event: connected\ndata: {"ok":true}\n\n`);

    const interval = setInterval(() => {
      response.write(`event: ping\ndata: {"ts":"${new Date().toISOString()}"}\n\n`);
    }, 20000);

    response.on("close", () => {
      clearInterval(interval);
    });
  });

  app.use((request, response) => {
    response.status(404).render("error", {
      message: "Page not found.",
      platform: response.locals.platform
    });
  });

  app.use((error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (
      request.path === "/marketplace/listings" &&
      (error.name === "MulterError" || /image uploads/i.test(error.message || ""))
    ) {
      setFlash(
        request,
        "error",
        `Listing image upload failed: ${error.message}. Use up to 4 images and max 5MB each.`
      );
      response.redirect("/marketplace/new");
      return;
    }

    response.status(500).render("error", {
      message: `Unexpected server error: ${error.message}`,
      platform: response.locals.platform || {}
    });
  });

  return app;
}

module.exports = {
  createApp
};
