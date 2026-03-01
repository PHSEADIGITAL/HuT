# Cloud environment defaults for HuT (backend + Expo mobile)

This repository now includes full-stack developer scripts for running backend and Expo mobile together:

- `npm run setup:all` - install backend and mobile dependencies
- `npm run dev:all` - start Node backend and Expo in one command
- `npm run dev:backend` - backend only
- `npm run dev:mobile` - mobile only

## Recommended default image setup

Preinstall in the cloud image:

1. Node.js 20+
2. npm 10+
3. Expo CLI tooling (invoked via `npx expo`)
4. Android emulator networking support (`10.0.2.2`) for local backend access
5. EAS CLI available via `npx eas` for Android cloud builds

## Recommended startup script for cloud agents

```bash
cd /workspace
npm run setup:all
```

## Optional developer command

If you want both services immediately available after startup:

```bash
cd /workspace
npm run dev:all
```

> Note: `dev:all` is long-running by design and should be used as an interactive dev command.
