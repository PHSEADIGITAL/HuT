# Hut! UX Wireframe (Re-designed)

## 1) Product Scope
Hut! is a booking web app focused on Bonny Island hotels:
- Browse hotels and room categories with real-time availability.
- Book and pay online (room amount + service charge commission).
- Automatic acknowledgement via **SMS + Email**.
- Hotel receives payout to configured bank account.
- Hut platform receives commission/service fee.
- Hotel admin sees bookings, payments, days booked, occupancy, pricing insights.

---

## 2) Primary Personas
1. **Guest (Customer)** – discovers hotels, books room, pays online, manages/cancels booking.
2. **Hotel Admin** – onboard hotel, configure cancellation policy and commission, manage rooms/bookings/payments.
3. **Platform Owner (Hut)** – earns commission and premium listing subscription revenue.

---

## 3) Information Architecture

```text
Customer Side
Auth (Register/Login) -> Home (Hotels) -> Hotel Details -> Booking + Payment -> Success + Acknowledgement
                                             \-> Manage Booking -> Cancel/Refund

Hotel Admin Side
Admin Login -> Admin Overview -> Hotel Dashboard
                         \-> Onboard Hotel (Platform Admin)

Platform Rules
Commission Model
Premium Listing Subscription
Refund/Cancellation Engine
Fraud Protection + Double-booking Prevention
Real-time Inventory Sync
```

---

## 4) Wireframes

## 4.1 Customer Home (Hotel Discovery)
```text
+----------------------------------------------------------------------------------+
| Hut! logo                         [Hotels] [Hotel Admin] [Onboard Hotel]        |
+----------------------------------------------------------------------------------+
| HERO: "Book trusted hotels in Bonny Island"                                     |
| [Check-in date] [Check-out date] [Update availability]                           |
+----------------------------------------------------------------------------------+
| [Premium Badge] Seaside Grand Hotel                                              |
| Finima Road | From NGN 55,000/night | 8 rooms available                          |
| [View rooms and book]                                                            |
+----------------------------------------------------------------------------------+
| Bonny Suites & Towers ... [View rooms and book]                                 |
+----------------------------------------------------------------------------------+
| Creekside Lodge ... [View rooms and book]                                       |
+----------------------------------------------------------------------------------+
| Floating: WhatsApp Support                                                       |
+----------------------------------------------------------------------------------+
```

### UX Notes
- Premium hotels appear first.
- Availability count is date-sensitive.
- Fast filter and clear price anchor.

---

## 4.2 Hotel Details + Booking
```text
+----------------------------------------------------------------------------------+
| Hotel Name + location + short description                                        |
+----------------------------------------------------------------------------------+
| Room categories table                                                            |
| Category | Price/Night | Total Units | Available Now (real-time)                |
+----------------------------------------------------------------------------------+
| Booking Form                                                                     |
| [Room Category] [Guests] [Check-in] [Check-out]                                 |
| [Full Name] [Email] [Phone]                                                      |
| [Emergency Contact Name] [Emergency Contact Phone]                               |
| [x] Pickup Add-on (fee shown)                                                    |
| [Special Request]                                                                 |
| Note: total = room + service charge (% commission model)                         |
| [Book and Pay Online]                                                            |
+----------------------------------------------------------------------------------+
| If not logged in as customer: "Sign in to book"                                  |
+----------------------------------------------------------------------------------+
| Cancellation summary                                                             |
| - 100% 48+ hrs, 50% 24-48 hrs, 0% <24 hrs, pickup refundable only 24+ hrs       |
+----------------------------------------------------------------------------------+
```

### UX Notes
- Emergency contact is mandatory for safety.
- Fraud checks run before final confirmation.
- Inventory lock + overlap checks prevent double booking.

---

## 4.3 Booking Success + Acknowledgement
```text
+----------------------------------------------------------------------------------+
| "Booking confirmed and paid"                                                     |
| Booking ID | Room Category | Check-in/out | Days Booked | Total Paid            |
| Transaction Ref                                                                   |
+----------------------------------------------------------------------------------+
| Acknowledgement log                                                              |
| SMS sent to +234...                                                              |
| Email sent to guest@example.com                                                  |
+----------------------------------------------------------------------------------+
| [Manage / Cancel Booking]                                                        |
+----------------------------------------------------------------------------------+
```

---

## 4.4 Manage Booking + Cancel
```text
+----------------------------------------------------------------------------------+
| Booking summary (status, payment, dates, emergency contact, total paid)          |
+----------------------------------------------------------------------------------+
| Cancellation policy bullets                                                      |
| [Cancel this booking]                                                            |
+----------------------------------------------------------------------------------+
| On submit -> show refund calculation + send SMS/Email cancellation notice        |
+----------------------------------------------------------------------------------+
```

---

## 4.5 Hotel Admin Dashboard
```text
+----------------------------------------------------------------------------------+
| Hotel: Seaside Grand Hotel                                                       |
| Gross Sales | Hotel Receivables | Platform Commission | Commission %             |
+----------------------------------------------------------------------------------+
| Premium Subscription                                                             |
| Status + Expiry + [Renew +30 days]                                               |
+----------------------------------------------------------------------------------+
| Real-time room availability table                                                |
| Room | Total Units | Booked | Available                                          |
+----------------------------------------------------------------------------------+
| Bookings table                                                                   |
| Created | Guest | Stay | Days Booked | Emergency Contact | Pickup | Fraud | ... |
+----------------------------------------------------------------------------------+
| Payment ledger                                                                   |
| Date | Type | Ref | Gross | Hotel Payout | Platform Earning                     |
+----------------------------------------------------------------------------------+
| Smart Pricing Insights                                                           |
| Room | Occupancy % | Recommendation                                              |
+----------------------------------------------------------------------------------+
```

---

## 5) Cancellation & Refund Rules (Configured During Onboarding)

### Flexible Policy (Implemented)
1. **100% refund** if cancelled **48+ hours** before check-in.  
2. **50% refund** if cancelled **24–48 hours** before check-in.  
3. **No refund** if cancelled **<24 hours** before check-in.  
4. **Pickup add-on** fully refundable only if cancelled **24+ hours** before check-in.

---

## 6) Real-Time Availability + Double Booking Prevention

### Prevention Logic
- On booking submit, server checks overlapping bookings for same room category and date range.
- Booking proceeds only if available inventory remains.
- Operation runs in write-lock to prevent race conditions from concurrent submissions.

### Real-Time Sync
- SSE (Server-Sent Events) notifies hotel/customer views when booking or cancellation occurs.
- UI auto-refreshes room availability table.

---

## 7) Fraud Protection (Baseline Rules)
- Velocity check: too many bookings by same phone/email in short window.
- High transaction amount threshold scoring.
- Disposable email domain check.
- Phone format validation.
- Short-notice high-risk bookings flagged.
- High scores are blocked or routed for manual review.

---

## 8) Revenue Model in UX
1. **% Commission model** on each successful paid booking.
2. **Premium listing subscription** monthly fee (hotel can opt-in during onboarding and renew from dashboard).

---

## 9) Added UX Enhancements (Recommendations)
1. **Booking modification flow** (change dates/room with fare difference handling).
2. **Saved guest profiles** for one-click rebooking.
3. **Refund timeline tracker** (Requested -> Approved -> Settled).
4. **Hotel response SLA badge** (e.g., "responds within 5 mins").
5. **Arrival checklist** in confirmation email (ID required, check-in policy, contact).

---

## 10) KPIs to Track
- Booking conversion rate
- Cancellation rate by lead-time bucket
- Fraud block rate / false positive rate
- Premium listing adoption rate
- Avg payout settlement time
- WhatsApp support deflection rate

