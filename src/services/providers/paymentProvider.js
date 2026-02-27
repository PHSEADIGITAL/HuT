const {
  providers,
  paystack,
  flutterwave
} = require("../../config");

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = data.message || `Provider request failed (${response.status})`;
    const error = new Error(message);
    error.details = data;
    throw error;
  }

  return data;
}

function getPaymentProvider() {
  return (providers.payment || "mock").toLowerCase();
}

async function initializePayment({
  bookingId,
  amountNaira,
  customerName,
  email,
  phone,
  callbackBaseUrl
}) {
  const provider = getPaymentProvider();
  if (provider === "mock") {
    return {
      provider: "mock",
      status: "paid",
      reference: `HUT-MOCK-${Date.now()}`
    };
  }

  if (provider === "paystack") {
    if (!paystack.secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is missing.");
    }

    const payload = {
      email,
      amount: Math.round(amountNaira * 100),
      callback_url: `${callbackBaseUrl}/payments/callback/paystack`,
      metadata: {
        bookingId,
        customerName,
        phone
      }
    };

    const data = await requestJson(paystack.initializeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystack.secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return {
      provider: "paystack",
      status: "redirect",
      reference: data.data.reference,
      paymentUrl: data.data.authorization_url
    };
  }

  if (provider === "flutterwave") {
    if (!flutterwave.secretKey) {
      throw new Error("FLUTTERWAVE_SECRET_KEY is missing.");
    }

    const txRef = `HUT-FLW-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const payload = {
      tx_ref: txRef,
      amount: amountNaira,
      currency: "NGN",
      redirect_url: `${callbackBaseUrl}/payments/callback/flutterwave`,
      customer: {
        email,
        phonenumber: phone,
        name: customerName
      },
      customizations: {
        title: "Hut Booking Payment",
        description: `Booking payment for ${bookingId}`
      },
      meta: {
        bookingId
      }
    };

    const data = await requestJson(flutterwave.initializeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flutterwave.secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    return {
      provider: "flutterwave",
      status: "redirect",
      reference: txRef,
      paymentUrl: data.data.link
    };
  }

  throw new Error(`Unsupported PAYMENT_PROVIDER value: ${provider}`);
}

async function verifyPayment({
  provider,
  reference,
  callbackQuery = {}
}) {
  if (provider === "mock") {
    return {
      verified: true,
      externalId: reference
    };
  }

  if (provider === "paystack") {
    if (!paystack.secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is missing.");
    }

    const encoded = encodeURIComponent(reference);
    const data = await requestJson(`${paystack.verifyUrlBase}/${encoded}`, {
      headers: {
        Authorization: `Bearer ${paystack.secretKey}`
      }
    });

    const successful = data.data.status === "success";
    return {
      verified: successful,
      externalId: String(data.data.id || reference),
      raw: data
    };
  }

  if (provider === "flutterwave") {
    if (!flutterwave.secretKey) {
      throw new Error("FLUTTERWAVE_SECRET_KEY is missing.");
    }

    const txRef = callbackQuery.tx_ref || reference;
    const endpoint = `${flutterwave.verifyUrlBase}?tx_ref=${encodeURIComponent(txRef)}`;
    const data = await requestJson(endpoint, {
      headers: {
        Authorization: `Bearer ${flutterwave.secretKey}`
      }
    });

    const successful = data.status === "success" && data.data.status === "successful";
    return {
      verified: successful,
      externalId: String(data.data.id || txRef),
      raw: data
    };
  }

  throw new Error(`Unsupported provider for verification: ${provider}`);
}

module.exports = {
  getPaymentProvider,
  initializePayment,
  verifyPayment
};
