# Hut! Deployment Notes

## 1) Environment
1. Copy `.env.example` to `.env`
2. Set production-safe values:
   - `SESSION_SECRET`
   - `BASE_URL` (public URL of your deployment)
   - provider credentials (if not using mock)

## 2) Docker deployment

```bash
docker compose up --build -d
```

App health endpoint:

```bash
curl http://localhost:3000/health
```

## 3) Provider modes

- `PAYMENT_PROVIDER=mock|paystack|flutterwave`
- `SMS_PROVIDER=mock|termii|twilio`
- `EMAIL_PROVIDER=mock|smtp|sendgrid`

If provider credentials are missing, the app surfaces provider-specific errors.

## 4) Security baseline

- Run behind HTTPS/TLS.
- Set `SESSION_SECURE_COOKIE=true` in production.
- Rotate `SESSION_SECRET` periodically.
- Restrict dashboard access with strong hotel-admin passwords.
