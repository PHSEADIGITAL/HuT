function toDateOnly(dateValue) {
  if (typeof dateValue === "string" && dateValue.length === 10) {
    return new Date(`${dateValue}T00:00:00.000Z`);
  }
  return new Date(dateValue);
}

function dateRangeOverlaps(startA, endA, startB, endB) {
  const aStart = toDateOnly(startA).getTime();
  const aEnd = toDateOnly(endA).getTime();
  const bStart = toDateOnly(startB).getTime();
  const bEnd = toDateOnly(endB).getTime();
  return aStart < bEnd && bStart < aEnd;
}

function calculateNights(checkInDate, checkOutDate) {
  const start = toDateOnly(checkInDate);
  const end = toDateOnly(checkOutDate);
  const milliseconds = end.getTime() - start.getTime();
  return Math.ceil(milliseconds / (1000 * 60 * 60 * 24));
}

function validateStayDates(checkInDate, checkOutDate) {
  const nights = calculateNights(checkInDate, checkOutDate);
  if (!Number.isFinite(nights) || nights <= 0) {
    return {
      valid: false,
      reason: "Check-out must be later than check-in."
    };
  }

  return {
    valid: true,
    nights
  };
}

function bookingBlocksInventory(booking) {
  return booking.status === "confirmed" || booking.status === "checked_in";
}

function countOverlappingBookings(
  data,
  roomId,
  checkInDate,
  checkOutDate,
  excludeBookingId
) {
  return data.bookings.filter((booking) => {
    if (excludeBookingId && booking.id === excludeBookingId) {
      return false;
    }

    if (booking.roomId !== roomId || !bookingBlocksInventory(booking)) {
      return false;
    }

    return dateRangeOverlaps(
      booking.checkInDate,
      booking.checkOutDate,
      checkInDate,
      checkOutDate
    );
  }).length;
}

function roomAvailability(data, room, checkInDate, checkOutDate) {
  const activeBookings = countOverlappingBookings(
    data,
    room.id,
    checkInDate,
    checkOutDate
  );
  const availableUnits = Math.max(0, room.totalUnits - activeBookings);
  return {
    roomId: room.id,
    category: room.category,
    totalUnits: room.totalUnits,
    activeBookings,
    availableUnits,
    soldOut: availableUnits <= 0
  };
}

function hotelAvailability(data, hotelId, checkInDate, checkOutDate) {
  const rooms = data.rooms.filter((room) => room.hotelId === hotelId);
  return rooms.map((room) => roomAvailability(data, room, checkInDate, checkOutDate));
}

function assertRoomAvailable(data, room, checkInDate, checkOutDate) {
  const availability = roomAvailability(data, room, checkInDate, checkOutDate);
  if (availability.availableUnits <= 0) {
    return {
      ok: false,
      reason:
        "Selected room category is no longer available for these dates. Please choose a different date or room."
    };
  }

  return { ok: true, availability };
}

module.exports = {
  calculateNights,
  validateStayDates,
  dateRangeOverlaps,
  hotelAvailability,
  roomAvailability,
  assertRoomAvailable
};
