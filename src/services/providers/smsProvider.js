const { providers, twilio, termii } = require("../../config");

function getSmsProvider() {
  return (providers.sms || "mock").toLowerCase();
}

async function sendSms({ to, body }) {
  const provider = getSmsProvider();

  if (provider === "mock") {
    return {
      ok: true,
      provider: "mock",
      messageId: `SMS-MOCK-${Date.now()}`
    };
  }

  if (provider === "termii") {
    if (!termii.apiKey) {
      throw new Error("TERMII_API_KEY is missing.");
    }

    const response = await fetch(termii.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to,
        from: termii.senderId,
        sms: body,
        type: "plain",
        channel: "generic",
        api_key: termii.apiKey
      })
    });

    const data = await response.json();
    if (!response.ok || data.code !== "ok") {
      throw new Error(data.message || "Termii SMS send failed.");
    }

    return {
      ok: true,
      provider: "termii",
      messageId: String(data.message_id || Date.now())
    };
  }

  if (provider === "twilio") {
    if (!twilio.accountSid || !twilio.authToken || !twilio.fromNumber) {
      throw new Error("Twilio credentials are incomplete.");
    }

    const bodyParams = new URLSearchParams({
      To: to,
      From: twilio.fromNumber,
      Body: body
    });
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`;
    const auth = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: bodyParams
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Twilio SMS send failed.");
    }

    return {
      ok: true,
      provider: "twilio",
      messageId: String(data.sid || Date.now())
    };
  }

  throw new Error(`Unsupported SMS_PROVIDER value: ${provider}`);
}

module.exports = {
  getSmsProvider,
  sendSms
};
