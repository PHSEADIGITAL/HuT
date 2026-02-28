const path = require("path");

const nodeEnv = process.env.NODE_ENV || "development";
const rawPaymentProvider = String(process.env.PAYMENT_PROVIDER || "mock").toLowerCase();
const allowedPaymentProviders = new Set(["mock", "paystack", "flutterwave"]);
const normalizedPaymentProvider = allowedPaymentProviders.has(rawPaymentProvider)
  ? rawPaymentProvider
  : "mock";

if (nodeEnv === "production" && normalizedPaymentProvider === "mock") {
  throw new Error(
    "PAYMENT_PROVIDER cannot be 'mock' in production. Use 'paystack' or 'flutterwave'."
  );
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null) {
    return fallback;
  }
  return value === "1" || value.toLowerCase() === "true";
}

module.exports = {
  appName: "HuT!",
  nodeEnv,
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  dbFilePath:
    process.env.DB_FILE_PATH || path.join(__dirname, "..", "data", "db.json"),
  session: {
    secret: process.env.SESSION_SECRET || "hut-dev-session-secret",
    secureCookie: boolEnv("SESSION_SECURE_COOKIE", false)
  },
  auth: {
    minimumPasswordLength: Number(process.env.MIN_PASSWORD_LENGTH || 8)
  },
  booking: {
    minServiceFee: 2500
  },
  providers: {
    payment: normalizedPaymentProvider,
    sms: process.env.SMS_PROVIDER || "mock",
    email: process.env.EMAIL_PROVIDER || "mock"
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || "",
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY || "",
    initializeUrl: process.env.PAYSTACK_INITIALIZE_URL || "https://api.paystack.co/transaction/initialize",
    verifyUrlBase: process.env.PAYSTACK_VERIFY_URL_BASE || "https://api.paystack.co/transaction/verify"
  },
  flutterwave: {
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY || "",
    webhookSecretHash: process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH || "",
    initializeUrl: process.env.FLUTTERWAVE_INITIALIZE_URL || "https://api.flutterwave.com/v3/payments",
    verifyUrlBase: process.env.FLUTTERWAVE_VERIFY_URL_BASE || "https://api.flutterwave.com/v3/transactions/verify_by_reference"
  },
  wallet: {
    allowManualTrustTopupInProduction: boolEnv("ALLOW_MANUAL_TRUST_TOPUP_IN_PRODUCTION", false)
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    fromNumber: process.env.TWILIO_FROM_NUMBER || ""
  },
  termii: {
    apiKey: process.env.TERMII_API_KEY || "",
    senderId: process.env.TERMII_SENDER_ID || "Hut",
    endpoint: process.env.TERMII_ENDPOINT || "https://api.ng.termii.com/api/sms/send"
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || "",
    fromEmail: process.env.SENDGRID_FROM_EMAIL || "noreply@hut.app",
    endpoint: process.env.SENDGRID_ENDPOINT || "https://api.sendgrid.com/v3/mail/send"
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: boolEnv("SMTP_SECURE", false),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    fromEmail: process.env.SMTP_FROM_EMAIL || "noreply@hut.app"
  },
  fraud: {
    blockThreshold: 70,
    reviewThreshold: 40,
    velocityWindowMinutes: 60,
    velocityMaxCount: 3,
    highValueNaira: 700000
  }
};
