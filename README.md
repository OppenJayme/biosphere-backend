# BioSphere Backend

The BioSphere backend is currently initialized as a clean NestJS 11 application
using TypeScript 5.9.

Database access, authentication, storage, email, API documentation, containers,
and deployment infrastructure are intentionally not wired yet. They will be
added one step at a time.

## Setup

```bash
npm install
```

## Run

```bash
# development
npm run start:dev

# production build
npm run build
npm run start:prod
```

The API uses `PORT` when it is set and otherwise starts on port 3000. Visit `/`
to confirm that the application is running.

## Verify

```bash
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```
