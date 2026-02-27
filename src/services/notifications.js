const { randomUUID } = require("crypto");

function pushNotification(data, payload) {
  const notification = {
    id: randomUUID(),
    ...payload,
    status: "sent",
    createdAt: new Date().toISOString()
  };
  data.notifications.push(notification);
  return notification;
}

function sendBookingAcknowledgements({ data, booking, hotel }) {
  const smsBody = `Hut! Booking confirmed (${booking.id.slice(
    0,
    8
  )}) at ${hotel.name} from ${booking.checkInDate} to ${
    booking.checkOutDate
  }. Total paid: NGN ${booking.pricing.totalPaid.toLocaleString()}.`;

  const emailBody = `Hello ${booking.customerName}, your Hut booking is confirmed.\n\nHotel: ${
    hotel.name
  }\nStay: ${booking.checkInDate} to ${booking.checkOutDate} (${
    booking.nights
  } nights)\nTotal paid: NGN ${booking.pricing.totalPaid.toLocaleString()}\nEmergency contact: ${
    booking.emergencyContactName
  } (${booking.emergencyContactPhone})\n\nThank you for using Hut!`;

  return [
    pushNotification(data, {
      bookingId: booking.id,
      hotelId: booking.hotelId,
      channel: "sms",
      recipient: booking.phone,
      body: smsBody
    }),
    pushNotification(data, {
      bookingId: booking.id,
      hotelId: booking.hotelId,
      channel: "email",
      recipient: booking.email,
      body: emailBody
    })
  ];
}

function sendCancellationAcknowledgements({ data, booking, hotel, refund }) {
  const smsBody = `Hut! Booking ${booking.id.slice(
    0,
    8
  )} cancelled. Refund: NGN ${refund.refundTotal.toLocaleString()}.`;

  const emailBody = `Hello ${booking.customerName},\n\nYour booking at ${
    hotel.name
  } has been cancelled.\nRefund approved: NGN ${refund.refundTotal.toLocaleString()}.\nCancellation lead time: ${Math.max(
    0,
    refund.leadHours
  ).toFixed(1)} hours before check-in.\n\nRegards,\nHut Support`;

  return [
    pushNotification(data, {
      bookingId: booking.id,
      hotelId: booking.hotelId,
      channel: "sms",
      recipient: booking.phone,
      body: smsBody
    }),
    pushNotification(data, {
      bookingId: booking.id,
      hotelId: booking.hotelId,
      channel: "email",
      recipient: booking.email,
      body: emailBody
    })
  ];
}

module.exports = {
  sendBookingAcknowledgements,
  sendCancellationAcknowledgements
};
