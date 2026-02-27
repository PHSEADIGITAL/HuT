const { booking: bookingConfig } = require("../config");

function roundNaira(value) {
  return Math.round(value);
}

function calculateBookingPrice({
  roomPricePerNight,
  nights,
  commissionRate,
  pickupRequested,
  pickupFee
}) {
  const roomSubtotal = roundNaira(roomPricePerNight * nights);
  const computedServiceFee = roundNaira(roomSubtotal * commissionRate);
  const serviceFee = Math.max(bookingConfig.minServiceFee, computedServiceFee);
  const pickupTotal = pickupRequested ? roundNaira(pickupFee || 0) : 0;
  const totalPaid = roomSubtotal + serviceFee + pickupTotal;
  const hotelPayout = roomSubtotal + pickupTotal;
  const platformRevenue = serviceFee;

  return {
    roomSubtotal,
    serviceFee,
    pickupTotal,
    totalPaid,
    hotelPayout,
    platformRevenue,
    commissionRateApplied: commissionRate
  };
}

function getSmartPricingInsights({ data, hotelId, lookbackDays = 30 }) {
  const now = new Date();
  const lookbackStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const rooms = data.rooms.filter((room) => room.hotelId === hotelId);

  return rooms.map((room) => {
    const bookings = data.bookings.filter(
      (booking) =>
        booking.roomId === room.id &&
        booking.status === "confirmed" &&
        new Date(booking.createdAt) >= lookbackStart
    );

    const bookedNights = bookings.reduce((sum, booking) => sum + (booking.nights || 0), 0);
    const capacityNights = room.totalUnits * lookbackDays;
    const occupancyRate = capacityNights > 0 ? bookedNights / capacityNights : 0;

    let recommendation;
    if (occupancyRate >= 0.8) {
      recommendation = "Increase by 10%-15% for this category.";
    } else if (occupancyRate >= 0.5) {
      recommendation = "Keep current rate; test +5% on weekends.";
    } else if (occupancyRate >= 0.3) {
      recommendation = "Offer 5%-8% discount on mid-week nights.";
    } else {
      recommendation = "Run demand campaign and test 10%-12% discount.";
    }

    return {
      roomId: room.id,
      category: room.category,
      basePrice: room.pricePerNight,
      occupancyRate,
      bookedNights,
      capacityNights,
      recommendation
    };
  });
}

module.exports = {
  calculateBookingPrice,
  getSmartPricingInsights
};
