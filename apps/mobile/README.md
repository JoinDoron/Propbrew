# Propbrew Estate mobile

Native Expo application for iOS and Android for the Estate Management module's residents, tenants and households. It signs in through the same Better Auth account as Propbrew web and reads/writes the same tenant-isolated PostgreSQL workspace through `/api/mobile/v1/*`. Maintenance requests hand off to the Estate operations queue; the user never leaves the Estate product or enters the Facility workspace.

```bash
cd apps/mobile
npm install
EXPO_PUBLIC_API_URL=https://usepropbrew.com npm run start
```

Use `npm run ios` or `npm run android` for native development builds. Secrets are stored with Expo SecureStore; operational writes carry idempotency keys and are authorised again on the server.
