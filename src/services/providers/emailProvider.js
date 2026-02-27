const { providers, sendgrid, smtp } = require("../../config");

function getEmailProvider() {
  return (providers.email || "mock").toLowerCase();
}

async function sendEmail({ to, subject, text }) {
  const provider = getEmailProvider();

  if (provider === "mock") {
    return {
      ok: true,
      provider: "mock",
      messageId: `EMAIL-MOCK-${Date.now()}`
    };
  }

  if (provider === "sendgrid") {
    if (!sendgrid.apiKey) {
      throw new Error("SENDGRID_API_KEY is missing.");
    }

    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: sendgrid.fromEmail },
      subject,
      content: [{ type: "text/plain", value: text }]
    };

    const response = await fetch(sendgrid.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendgrid.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(bodyText || "SendGrid email send failed.");
    }

    return {
      ok: true,
      provider: "sendgrid",
      messageId: `SENDGRID-${Date.now()}`
    };
  }

  if (provider === "smtp") {
    if (!smtp.host || !smtp.user || !smtp.pass) {
      throw new Error("SMTP credentials are incomplete.");
    }

    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass
      }
    });

    const info = await transporter.sendMail({
      from: smtp.fromEmail,
      to,
      subject,
      text
    });

    return {
      ok: true,
      provider: "smtp",
      messageId: String(info.messageId || Date.now())
    };
  }

  throw new Error(`Unsupported EMAIL_PROVIDER value: ${provider}`);
}

module.exports = {
  getEmailProvider,
  sendEmail
};
