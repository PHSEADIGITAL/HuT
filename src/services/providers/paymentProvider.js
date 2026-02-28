const crypto = require("crypto");
const { providers, paystack, flutterwave, nodeEnv } = require("../../config");

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

function secureCompareText(left = "", right = "") {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function buildPaystackSplitPayload(splitConfig = {}) {
  const subaccount = String(splitConfig.paystackSubaccountCode || "").trim();
  if (!subaccount) {
    return {};
  }

  const platformFeeNaira = Math.max(0, Math.round(Number(splitConfig.platformFeeNaira) || 0));
  return {
    subaccount,
    transaction_charge: platformFeeNaira * 100
  };
}

function buildFlutterwaveSplitPayload(splitConfig = {}) {
  const subaccountId = String(splitConfig.flutterwaveSubaccountId || "").trim();
  if (!subaccountId) {
    return {};
  }

  const hotelShareNaira = Math.max(0, Math.round(Number(splitConfig.hotelShareNaira) || 0));
  return {
    subaccounts: [
      {
        id: subaccountId,
        transaction_split_ratio: 100,
        transaction_charge: hotelShareNaira
      }
    ]
  };
}

async function initializePayment({
  bookingId,
  amountNaira,
  customerName,
  email,
  phone,
  callbackBaseUrl,
  splitConfig = {}
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
        purpose: "booking_payment",
        customerName,
        phone
      },
      ...buildPaystackSplitPayload(splitConfig)
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
        title: "HuT Booking Payment",
        description: `Booking payment for ${bookingId}`
      },
      meta: {
        bookingId,
        purpose: "booking_payment"
      },
      ...buildFlutterwaveSplitPayload(splitConfig)
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

async function initializeWalletTopup({
  intentId,
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
      reference: `HUT-WTOP-MOCK-${Date.now()}`
    };
  }

  if (provider === "paystack") {
    if (!paystack.secretKey) {
      throw new Error("PAYSTACK_SECRET_KEY is missing.");
    }

    const payload = {
      email,
      amount: Math.round(amountNaira * 100),
      callback_url: `${callbackBaseUrl}/wallet/topup/callback/paystack`,
      metadata: {
        intentId,
        purpose: "wallet_topup",
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

    const txRef = `HUT-WTOP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const payload = {
      tx_ref: txRef,
      amount: amountNaira,
      currency: "NGN",
      redirect_url: `${callbackBaseUrl}/wallet/topup/callback/flutterwave`,
      customer: {
        email,
        phonenumber: phone,
        name: customerName
      },
      customizations: {
        title: "HuT Wallet Top-up",
        description: `Wallet top-up intent ${intentId}`
      },
      meta: {
        intentId,
        purpose: "wallet_topup"
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

function verifyWebhookSignature({
  provider,
  rawBody,
  headers = {}
}) {
  const normalizedProvider = String(provider || "").toLowerCase();
  if (normalizedProvider === "mock") {
    return nodeEnv !== "production";
  }

  const raw = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody || {}));

  if (normalizedProvider === "paystack") {
    const signature = headers["x-paystack-signature"] || headers["X-Paystack-Signature"];
    if (!signature || !paystack.webhookSecret) {
      return false;
    }
    const digest = crypto
      .createHmac("sha512", paystack.webhookSecret)
      .update(raw)
      .digest("hex");
    return secureCompareText(digest, signature);
  }

  if (normalizedProvider === "flutterwave") {
    const signature =
      headers["verif-hash"] ||
      headers["Verif-Hash"] ||
      headers["x-verif-hash"] ||
      headers["X-Verif-Hash"];
    if (!signature || !flutterwave.webhookSecretHash) {
      return false;
    }
    return secureCompareText(signature, flutterwave.webhookSecretHash);
  }

  return false;
}

function getWebhookEventDetails(provider, payload = {}) {
  const normalizedProvider = String(provider || "").toLowerCase();
  if (normalizedProvider === "paystack") {
    const eventType = String(payload.event || "");
    const reference = String(payload.data?.reference || "").trim();
    const eventId = String(payload.data?.id || "");
    return {
      eventType,
      reference,
      eventId,
      successful: eventType === "charge.success",
      dedupeKey: `${normalizedProvider}:${eventType}:${eventId || reference}`
    };
  }

  if (normalizedProvider === "flutterwave") {
    const eventType = String(payload.event || payload.type || "");
    const reference = String(payload.data?.tx_ref || payload.tx_ref || "").trim();
    const eventId = String(payload.data?.id || "");
    const status = String(payload.data?.status || payload.status || "").toLowerCase();
    const successful = status === "successful" || eventType === "charge.completed";
    return {
      eventType,
      reference,
      eventId,
      successful,
      dedupeKey: `${normalizedProvider}:${eventType}:${eventId || reference}`
    };
  }

  return {
    eventType: "",
    reference: "",
    eventId: "",
    successful: false,
    dedupeKey: `${normalizedProvider}:unknown`
  };
}

module.exports = {
  getPaymentProvider,
  initializePayment,
  initializeWalletTopup,
  verifyPayment,
  verifyWebhookSignature,
  getWebhookEventDetails
};
