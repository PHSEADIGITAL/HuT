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
- platform owner revenue dashboard aggregating all hotel/platform transactions
- Bonny Island second-hand marketplace with image uploads
- marketplace categories (Electronics, Furniture, Fashion, etc.)
- paid marketplace listing plans (Basic/Premium) to increase monthly listing quota
- seller contact unlock flow (NGN 200 fee paid to platform account)
- virtual wallet for users (top-up and spend on unlock fees)
- OTP-based forgot password (email or phone)

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
- `GET /wallet` - Virtual wallet and ledger
- `POST /wallet/topup` - Credit wallet after transfer
- `GET /marketplace` - Browse second-hand listings
- `GET /marketplace/new` - Create listing (auth required)
- `GET /marketplace/my-listings` - Manage seller listings
- `GET /marketplace/listings/:listingId` - Listing detail
- `POST /marketplace/listings/:listingId/unlock-contact` - Unlock seller contact for NGN 200
- `POST /marketplace/plans/purchase` - Buy listing plan to increase monthly quota
- `GET /auth/forgot-password` - Request OTP reset
- `POST /auth/forgot-password` - Send OTP via email/SMS
- `GET /auth/reset-password` - OTP password reset form
- `POST /auth/reset-password` - Reset password using OTP

### Hotel Admin
- `GET /admin` - Admin overview (requires hotel admin/platform admin)
- `GET /admin/hotels/new` - Hotel onboarding (platform admin)
- `POST /admin/hotels` - Create hotel
- `GET /admin/hotels/:hotelId/dashboard` - Hotel dashboard
- `POST /admin/hotels/:hotelId/subscription/renew` - Renew premium listing

### Platform Owner
- `GET /admin/owner-dashboard` - Unified revenue and transaction overview

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

## Marketplace Rules

- Each user can create up to **4 listings per month**.
- Users can increase limit by buying listing plans:
  - **Basic Plan**: +6 listings/month
  - **Premium Plan**: +21 listings/month
- Seller phone numbers are masked by default.
- Buyers pay **NGN 200** to unlock a seller contact.
- Unlock fee is recorded as platform revenue.
- Wallet top-ups are credited to user virtual wallets and tracked in the ledger.
- Wallet top-up is disabled for hotel admin accounts.

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
