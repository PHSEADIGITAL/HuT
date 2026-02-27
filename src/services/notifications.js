const { randomUUID } = require("crypto");
const { sendSms } = require("./providers/smsProvider");
const { sendEmail } = require("./providers/emailProvider");

function pushNotification(data, payload) {
  const notification = {
    id: randomUUID(),
    ...payload,
    createdAt: new Date().toISOString()
  };
  data.notifications.push(notification);
  return notification;
}

async function sendNotificationByChannel({ channel, recipient, body, subject }) {
  if (channel === "sms") {
    return sendSms({
      to: recipient,
      body
    });
  }

  if (channel === "email") {
    return sendEmail({
      to: recipient,
      subject: subject || "Hut Booking Update",
      text: body
    });
  }

  throw new Error(`Unsupported channel: ${channel}`);
}

async function dispatchAndLogNotification(data, payload) {
  try {
    const providerResult = await sendNotificationByChannel({
      channel: payload.channel,
      recipient: payload.recipient,
      body: payload.body,
      subject: payload.subject
    });

    return pushNotification(data, {
      ...payload,
      status: "sent",
      provider: providerResult.provider,
      providerMessageId: providerResult.messageId
    });
  } catch (error) {
    return pushNotification(data, {
      ...payload,
      status: "failed",
      provider: "unknown",
      error: error.message
    });
  }
}

async function sendBookingAcknowledgements({ data, booking, hotel }) {
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

  return Promise.all([
    dispatchAndLogNotification(data, {
      bookingId: booking.id,
      hotelId: booking.hotelId,
      channel: "sms",
      recipient: booking.phone,
      body: smsBody
    }),
    dispatchAndLogNotification(data, {
      bookingId: booking.id,
      hotelId: booking.hotelId,
      channel: "email",
      recipient: booking.email,
      subject: "Your Hut booking is confirmed",
      body: emailBody
    })
  ]);
}

async function sendCancellationAcknowledgements({ data, booking, hotel, refund }) {
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

  return Promise.all([
    dispatchAndLogNotification(data, {
      bookingId: booking.id,
      hotelId: booking.hotelId,
      channel: "sms",
      recipient: booking.phone,
      body: smsBody
    }),
    dispatchAndLogNotification(data, {
      bookingId: booking.id,
      hotelId: booking.hotelId,
      channel: "email",
      recipient: booking.email,
      subject: "Your Hut booking was cancelled",
      body: emailBody
    })
  ]);
}

module.exports = {
  sendBookingAcknowledgements,
  sendCancellationAcknowledgements
};
