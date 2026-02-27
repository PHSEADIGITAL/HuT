# Hut!

Hut! is a hotel booking web app for Bonny Island with:

- hotel discovery and room category pricing
- customer + hotel-admin authentication
- online booking + payment (mock by default, real providers supported)
- service charge/commission model
- premium hotel listing subscription
- emergency contact capture in booking
- pickup add-on
- cancellation + refund engine (flexible policy rules)
- SMS + Email acknowledgement (mock by default, real providers supported)
- fraud protection scoring
- real-time availability updates
- hotel admin dashboard with payout logs, days booked, and smart pricing insights

---

## Tech Stack

- Node.js
- Express
- EJS templates
- express-session auth
- File-backed JSON datastore (`data/db.json`)
- Provider adapters: Paystack/Flutterwave, Termii/Twilio, SMTP/SendGrid

---

## Run Locally

```bash
npm install
cp .env.example .env
npm start
```

Open: `http://localhost:3000`

---

## Demo Accounts

### Platform owner
- Email: `owner@hut.app`
- Password: `Owner@123`

### Hotel admin
- Email: `admin@seaside.hut`
- Password: `Admin@123`

### Customer
- Email: `customer@hut.app`
- Password: `Customer@123`

---

## Key Routes

### Customer
- `GET /` - Browse hotels and availability
- `GET /hotels/:hotelId` - Hotel details + booking form
- `POST /bookings` - Book and pay (requires customer login)
- `GET /bookings/:bookingId/pay` - Continue payment if redirect-based provider
- `GET /bookings/:bookingId/success` - Confirmation + acknowledgement
- `GET /bookings/:bookingId/manage` - Manage/cancel booking
- `POST /bookings/:bookingId/cancel` - Cancel and calculate refund

### Hotel Admin
- `GET /admin` - Admin overview (requires hotel admin/platform admin)
- `GET /admin/hotels/new` - Hotel onboarding (platform admin)
- `POST /admin/hotels` - Create hotel
- `GET /admin/hotels/:hotelId/dashboard` - Hotel dashboard
- `POST /admin/hotels/:hotelId/subscription/renew` - Renew premium listing

### API
- `GET /health` - Health check
- `GET /api/hotels/:hotelId/availability` - Availability snapshot
- `GET /api/hotels/:hotelId/availability/stream` - SSE real-time updates
- `GET /payments/callback/paystack` - Payment callback
- `GET /payments/callback/flutterwave` - Payment callback

---

## UX Wireframe

See: `docs/ux-wireframe-v2.md`

---

## Provider Configuration

Edit `.env`:

- `PAYMENT_PROVIDER=mock|paystack|flutterwave`
- `SMS_PROVIDER=mock|termii|twilio`
- `EMAIL_PROVIDER=mock|smtp|sendgrid`

Provider-specific credentials are documented in `.env.example`.

---

## Sanity and Test Commands

```bash
npm test
npm run smoke
```

---

## Deploy (Docker)

```bash
docker compose up --build
```

The app exposes `/health` for container/platform probes.

Detailed guide: `docs/deployment.md`
