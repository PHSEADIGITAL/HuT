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
- buyer/seller marketplace account types
- seller listing plans: Free (4), Basic (20), Premium (40), Gold (unlimited)
- buyer contact subscription flow (NGN 500/month) for seller contact unlock
- virtual wallet for users (top-up and spend on unlock fees)
- OTP-based forgot password (email or phone)
- React Native mobile app (Expo) connected to Node.js API (`mobile/`)

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
- `GET /` - Landing page (choose Stays or Marketplace)
- `GET /stays` - Browse hotels and availability
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
- `POST /marketplace/listings/:listingId/unlock-contact` - Buyer unlock using active subscription
- `POST /marketplace/contact-subscription/purchase` - Activate buyer contact access (NGN 500/month)
- `POST /marketplace/plans/purchase` - Seller listing plan purchase
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
- `POST /api/auth/register` - Mobile registration + token
- `POST /api/auth/login` - Mobile login + token
- `GET /api/auth/me` - Mobile profile
- `GET /api/stays` - Hotel listing API
- `GET /api/stays/:hotelId` - Hotel detail API
- `GET /api/marketplace/listings` - Marketplace listing API
- `GET /api/marketplace/listings/:listingId` - Marketplace detail API
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

- User selects marketplace account type at signup:
  - **Buyer**: unlock contacts via subscription
  - **Seller**: create/manage listings and seller plans
- Seller plans:
  - **Free**: 4 listings/month
  - **Basic**: 20 listings/month
  - **Premium**: 40 listings/month
  - **Gold**: unlimited listings
- Seller phone numbers are masked by default.
- Buyers subscribe at **NGN 500/month** to unlock any seller contact.
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
