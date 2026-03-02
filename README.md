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
- mobile booking checkout, wallet top-up UI, camera/gallery uploads, seller+hotel reviews, and admin dashboards

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
npm run setup:mobile
cp .env.example .env
npm start
```

Open: `http://localhost:3000`

For mobile device testing on the same Wi-Fi, open:

- `http://<your-computer-lan-ip>:3000/health`
- Example: `http://192.168.1.168:3000/health`

> Do not use Expo port `8081` for API checks; `8081` is Metro bundler, not the backend API.

Run backend + mobile together:

```bash
npm run dev:all
```

## Android Build (Mobile-First)

The Expo mobile app in `mobile/` is configured for Android builds via EAS.

From repo root:

```bash
npm run mobile:android
```

Build Android preview APK:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.com npm run mobile:build:android:preview
```

Build Android production AAB:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.com npm run mobile:build:android:production
```

Cloud defaults note: `docs/cloud-env-defaults.md`

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
- `GET /api/wallet` - Wallet balance, transactions, pending topups
- `POST /api/wallet/topup` - Initialize or complete wallet top-up
- `GET /api/stays` - Hotel listing API
- `GET /api/stays/:hotelId` - Hotel detail API
- `POST /api/hotels/:hotelId/reviews` - Submit or update hotel review
- `POST /api/bookings` - Create booking + checkout session
- `GET /api/bookings/my` - Customer booking history
- `GET /api/bookings/:bookingId` - Booking detail
- `POST /api/bookings/:bookingId/cancel` - Cancel confirmed booking
- `GET /api/marketplace/listings` - Marketplace listing API
- `GET /api/marketplace/listings/:listingId` - Marketplace detail API
- `GET /api/marketplace/sellers/:sellerUserId` - Seller profile + ratings
- `POST /api/marketplace/sellers/:sellerUserId/reviews` - Submit/update seller review
- `POST /api/marketplace/listings/upload-images` - Upload seller images (camera/gallery flow)
- `GET /api/hotels/:hotelId/availability` - Availability snapshot
- `GET /api/hotels/:hotelId/availability/stream` - SSE real-time updates
- `GET /api/admin/hotels` - Admin-accessible hotels
- `GET /api/admin/hotels/:hotelId/dashboard` - Hotel admin dashboard data
- `POST /api/admin/hotels/:hotelId/rooms/:roomId` - Update room price/inventory
- `POST /api/admin/hotels/:hotelId/commission` - Update commission (platform owner)
- `GET /api/admin/owner-dashboard` - Platform owner revenue API dashboard
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
