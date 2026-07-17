# Cyfurden

An original virtual convention booth for independent artists: browse small-batch goods, keep a lightweight cart, and hand off to manual bank-transfer instructions without a payment provider.

The application uses the standard Next.js App Router runtime and is intended for a Railpack deployment on a Coolify-managed VM. Product and payment images resolve from Oracle Object Storage through public delivery URLs.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` when an Oracle Object Storage public delivery origin is available. Product records store object keys; the browser never receives Oracle credentials.

## Quality checks

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```
