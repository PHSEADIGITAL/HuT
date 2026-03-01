# HuT Mobile (React Native + Expo) — Android First

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

Open directly on Android emulator:

```bash
# from repository root
npm run mobile:android
```

## API Base URL

Set `EXPO_PUBLIC_API_BASE_URL` if your backend is not reachable on default values:

- Android emulator default: `http://10.0.2.2:3000`
- iOS simulator default: `http://localhost:3000`

Example:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:3000 npm start
```

For production builds, set this to your HTTPS API:

```bash
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.com
```

## Android Build (APK/AAB) with EAS

This project includes `eas.json` profiles for Android builds.

### One-time setup

```bash
cd mobile
npx eas login
npx eas build:configure
```

### Build preview APK (internal testing)

```bash
cd mobile
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.com npm run build:android:preview
```

### Build production AAB (Play Store)

```bash
cd mobile
EXPO_PUBLIC_API_BASE_URL=https://api.your-domain.com npm run build:android:production
```

### Submit latest build to Play Console (internal track)

```bash
cd mobile
npm run submit:android
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
