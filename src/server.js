const path = require("path");
const express = require("express");
const { randomUUID } = require("crypto");
const { appName, port } = require("./config");
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

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.locals.formatNaira = formatNaira;
app.locals.formatPercent = formatPercent;
app.locals.appName = appName;

function isoDateOffset(daysFromToday) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sortHotelsForMarketplace(hotels) {
  return [...hotels].sort((a, b) => {
    if (a.premiumListingActive !== b.premiumListingActive) {
      return a.premiumListingActive ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

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
    const roomsAvailable = availability.reduce(
      (sum, room) => sum + room.availableUnits,
      0
    );
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
    response.status(404).render("error", { message: "Hotel not found." });
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

app.post("/bookings", async (request, response) => {
  const {
    hotelId,
    roomId,
    customerName,
    email,
    phone,
    emergencyContactName,
    emergencyContactPhone,
    checkInDate,
    checkOutDate,
    guests,
    pickupRequested,
    specialRequest
  } = request.body;

  const baseInput = {
    hotelId: String(hotelId || ""),
    roomId: String(roomId || ""),
    customerName: String(customerName || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    phone: String(phone || "").trim(),
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
    !baseInput.customerName ||
    !baseInput.email ||
    !baseInput.phone ||
    !baseInput.emergencyContactName ||
    !baseInput.emergencyContactPhone
  ) {
    response.status(400).render("error", {
      message: "Missing required booking information. Please fill all fields."
    });
    return;
  }

  const dateValidation = validateStayDates(baseInput.checkInDate, baseInput.checkOutDate);
  if (!dateValidation.valid) {
    response.status(400).render("error", { message: dateValidation.reason });
    return;
  }

  const result = await withWriteLock(async (data) => {
    const hotel = data.hotels.find((item) => item.id === baseInput.hotelId);
    const room = data.rooms.find(
      (item) => item.id === baseInput.roomId && item.hotelId === baseInput.hotelId
    );

    if (!hotel || !room) {
      return {
        error: "Selected hotel/room no longer exists."
      };
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
      bookingInput: baseInput,
      amount: pricing.totalPaid
    });

    if (fraudAssessment.blocked) {
      data.fraudEvents.push({
        id: randomUUID(),
        hotelId: hotel.id,
        email: baseInput.email,
        phone: baseInput.phone,
        score: fraudAssessment.score,
        flags: fraudAssessment.flags,
        action: "blocked",
        createdAt: new Date().toISOString()
      });

      return {
        error:
          "Booking blocked by fraud protection. Please contact support on WhatsApp for a manual review."
      };
    }

    const booking = {
      id: randomUUID(),
      hotelId: hotel.id,
      roomId: room.id,
      roomCategory: room.category,
      customerName: baseInput.customerName,
      email: baseInput.email,
      phone: baseInput.phone,
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
      status: "confirmed",
      paymentStatus: "paid",
      cancellationPolicy: hotel.cancellationPolicy,
      createdAt: new Date().toISOString()
    };
    data.bookings.push(booking);

    data.payments.push({
      id: randomUUID(),
      bookingId: booking.id,
      hotelId: hotel.id,
      transactionRef: `HUT-PAY-${Date.now()}`,
      transactionType: "booking_payment",
      grossAmount: booking.pricing.totalPaid,
      hotelPayout: booking.pricing.hotelPayout,
      platformEarning: booking.pricing.platformRevenue,
      commissionRate: booking.pricing.commissionRateApplied,
      hotelBankAccount: hotel.bankAccount,
      platformBankAccount: data.platform.bankAccount,
      createdAt: new Date().toISOString()
    });

    const notifications = sendBookingAcknowledgements({
      data,
      booking,
      hotel
    });

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

    broadcast("availability_update", {
      hotelId: hotel.id,
      bookingId: booking.id,
      updatedAt: new Date().toISOString()
    });

    return {
      bookingId: booking.id,
      notifications: notifications.length
    };
  });

  if (result.error) {
    response.status(400).render("error", { message: result.error });
    return;
  }

  response.redirect(`/bookings/${result.bookingId}/success`);
});

app.get("/bookings/:bookingId/success", async (request, response) => {
  const snapshot = await getSnapshot();
  const booking = snapshot.bookings.find((item) => item.id === request.params.bookingId);

  if (!booking) {
    response.status(404).render("error", { message: "Booking not found." });
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

app.get("/bookings/:bookingId/manage", async (request, response) => {
  const snapshot = await getSnapshot();
  const booking = snapshot.bookings.find((item) => item.id === request.params.bookingId);

  if (!booking) {
    response.status(404).render("error", { message: "Booking not found." });
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

app.post("/bookings/:bookingId/cancel", async (request, response) => {
  const bookingId = request.params.bookingId;
  const result = await withWriteLock(async (data) => {
    const booking = data.bookings.find((item) => item.id === bookingId);
    if (!booking) {
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
      grossAmount: -refund.refundTotal,
      hotelPayout: -Math.min(booking.pricing.hotelPayout, refund.refundTotal),
      platformEarning: -Math.max(0, refund.refundTotal - booking.pricing.hotelPayout),
      commissionRate: booking.pricing.commissionRateApplied,
      hotelBankAccount: hotel.bankAccount,
      platformBankAccount: data.platform.bankAccount,
      createdAt: cancelledAt
    });

    sendCancellationAcknowledgements({
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

  const message = encodeURIComponent(result.error || "Booking cancelled successfully.");
  response.redirect(`/bookings/${bookingId}/manage?message=${message}`);
});

app.get("/admin", async (request, response) => {
  const snapshot = await getSnapshot();
  const hotels = snapshot.hotels.map((hotel) => {
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
});

app.get("/admin/hotels/new", async (request, response) => {
  const snapshot = await getSnapshot();
  response.render("admin-hotel-new", {
    platform: snapshot.platform
  });
});

app.post("/admin/hotels", async (request, response) => {
  const {
    name,
    description,
    location,
    bankName,
    bankAccount,
    cancellationPolicy,
    commissionRate,
    pickupFee,
    premiumListingActive
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
      premiumListingExpiresAt: premiumListingActive === "on"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null,
      pickupFee: Math.max(0, toNumber(pickupFee, 0)),
      createdAt: new Date().toISOString()
    };

    if (!hotel.name || !hotel.bankAccount || !hotel.bankName) {
      return { error: "Hotel name and bank details are required." };
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
    response.status(400).render("error", { message: result.error });
    return;
  }

  response.redirect(`/admin/hotels/${result.hotelId}/dashboard`);
});

app.post("/admin/hotels/:hotelId/subscription/renew", async (request, response) => {
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
    response.status(404).render("error", { message: result.error });
    return;
  }

  response.redirect(`/admin/hotels/${hotelId}/dashboard`);
});

app.get("/admin/hotels/:hotelId/dashboard", async (request, response) => {
  const checkInDate = request.query.checkInDate || isoDateOffset(1);
  const checkOutDate = request.query.checkOutDate || isoDateOffset(2);

  const snapshot = await getSnapshot();
  const hotel = snapshot.hotels.find((item) => item.id === request.params.hotelId);

  if (!hotel) {
    response.status(404).render("error", { message: "Hotel not found." });
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

  const bookingPayments = payments.filter((item) => item.transactionType === "booking_payment");
  const grossSales = bookingPayments.reduce((sum, payment) => sum + payment.grossAmount, 0);
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
});

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
  response.status(404).render("error", { message: "Page not found." });
});

app.listen(port, () => {
  console.log(`${appName} running on http://localhost:${port}`);
});
