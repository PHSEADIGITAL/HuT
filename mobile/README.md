# HuT Mobile (React Native + Expo)

This folder contains the React Native app for HuT, backed by the existing Node.js API.

## Prerequisites

- Node.js 20+
- Expo Go app (for device testing) or Android/iOS emulator

## Run

1. Install dependencies from repository root:

```bash
npm run setup:all
```

2. Start backend API from repository root:

```bash
npm start
```

3. Start mobile app:

```bash
cd mobile
npm start
```

Or run both backend + mobile from repository root:

```bash
npm run dev:all
```

## API Base URL

Set `EXPO_PUBLIC_API_BASE_URL` if your backend is not reachable on default values:

- Android emulator default: `http://10.0.2.2:3000`
- iOS simulator default: `http://localhost:3000`

Example:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:3000 npm start
```

## Mobile Features Implemented

- chooser landing screen (Stays vs Marketplace)
- account registration/login via `/api/auth/*`
- buyer/seller account types
- stays browsing + detail via `/api/stays*`
- mobile booking checkout flow via `/api/bookings*`
- in-app hotel review submission and listing
- marketplace browsing + detail via `/api/marketplace/listings*`
- in-app seller reviews and ratings
- buyer contact subscription + contact unlock flow
- seller listing creation and my listings
- camera/gallery image upload for seller listings (`expo-image-picker`)
- wallet top-up and wallet activity feed via `/api/wallet*`
- admin mobile screens:
  - hotel admin dashboard list (`/api/admin/hotels`)
  - hotel dashboard operations (`/api/admin/hotels/:hotelId/dashboard`)
  - room inventory/price updates (`/api/admin/hotels/:hotelId/rooms/:roomId`)
  - commission control for platform owner (`/api/admin/hotels/:hotelId/commission`)
  - platform owner revenue dashboard (`/api/admin/owner-dashboard`)
