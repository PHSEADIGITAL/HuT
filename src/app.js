require("dotenv").config();

const path = require("path");
const { randomUUID } = require("crypto");
const express = require("express");
const session = require("express-session");
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
  registerCustomer,
  authenticateUser,
  canAccessHotel
} = require("./services/users");
const { hashPassword } = require("./services/password");

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

  app.post("/auth/logout", (request, response) => {
    request.session.destroy(() => {
      response.redirect("/");
    });
  });

  app.get("/", async (request, response) => {
    const checkInDate = request.query.checkInDate || isoDateOffset(1);
    const checkOutDate = request.query.checkOutDate || isoDateOffset(2);
    const snapshot = await getSnapshot();

    const hotels = sortHotelsForMarketplace(snapshot.hotels).map((hotel) => {
      const rooms = snapshot.rooms.filter((room) => room.hotelId === hotel.id);
      const minPrice = rooms.reduce(
        (current, room) => Math.min(current, room.pricePerNight),
        Number.POSITIVE_INFINITY
      );
      const availability = hotelAvailability(snapshot, hotel.id, checkInDate, checkOutDate);
      const roomsAvailable = availability.reduce((sum, room) => sum + room.availableUnits, 0);
      return {
        ...hotel,
        minPrice: Number.isFinite(minPrice) ? minPrice : 0,
        roomsAvailable
      };
    });

    response.render("index", {
      hotels,
      checkInDate,
      checkOutDate,
      platform: snapshot.platform
    });
  });

  app.get("/hotels/:hotelId", async (request, response) => {
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
      hotel,
      rooms: roomCards,
      checkInDate,
      checkOutDate,
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
