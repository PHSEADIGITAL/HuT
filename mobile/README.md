# HuT Mobile (React Native + Expo)

This folder contains the React Native app for HuT, backed by the existing Node.js API.

## Prerequisites

- Node.js 20+
- Expo Go app (for device testing) or Android/iOS emulator

## Run

1. Start backend API from repository root:

```bash
npm start
```

2. Start mobile app:

```bash
cd mobile
npm start
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
- marketplace browsing + detail via `/api/marketplace/listings*`
- buyer contact subscription + contact unlock flow
- seller listing creation and my listings
