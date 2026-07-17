# Cyfurden

An original virtual convention booth for independent artists: browse small-batch goods, keep a lightweight cart, and hand off to manual bank-transfer instructions without a payment provider.

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
