# Hut!

Hut! is a hotel booking web app for Bonny Island with:

- hotel discovery and room category pricing
- online booking + payment simulation
- service charge/commission model
- premium hotel listing subscription
- emergency contact capture in booking
- pickup add-on
- cancellation + refund engine (flexible policy rules)
- SMS + Email acknowledgement logs
- fraud protection scoring
- real-time availability updates
- hotel admin dashboard with payout logs, days booked, and smart pricing insights

---

## Tech Stack

- Node.js
- Express
- EJS templates
- File-backed JSON datastore (`data/db.json`)

---

## Run Locally

```bash
npm install
npm start
```

Open: `http://localhost:3000`

---

## Key Routes

### Customer
- `GET /` - Browse hotels and availability
- `GET /hotels/:hotelId` - Hotel details + booking form
- `POST /bookings` - Book and pay
- `GET /bookings/:bookingId/success` - Confirmation + acknowledgement
- `GET /bookings/:bookingId/manage` - Manage/cancel booking
- `POST /bookings/:bookingId/cancel` - Cancel and calculate refund

### Hotel Admin
- `GET /admin` - Admin overview
- `GET /admin/hotels/new` - Hotel onboarding
- `POST /admin/hotels` - Create hotel
- `GET /admin/hotels/:hotelId/dashboard` - Hotel dashboard
- `POST /admin/hotels/:hotelId/subscription/renew` - Renew premium listing

### API
- `GET /api/hotels/:hotelId/availability` - Availability snapshot
- `GET /api/hotels/:hotelId/availability/stream` - SSE real-time updates

---

## UX Wireframe

See: `docs/ux-wireframe-v2.md`
