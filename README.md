# Cyfurden

An original virtual convention booth for independent artists: browse small-batch goods, keep a lightweight cart, reserve stock, and hand off to manual bank-transfer instructions (generated VietQR or an uploaded QR) without a payment provider. Booth teams manage storefronts, products, orders, and more from a bilingual (English/Vietnamese) workspace.

The application uses the standard Next.js App Router runtime with PostgreSQL (Prisma), Better Auth, and Oracle Object Storage, and is deployed with Railpack on a Coolify-managed VM.

## Local development

Requirements: Node.js 22.13 or newer and Docker (or any PostgreSQL 16 server).

1. Start a local PostgreSQL 16 database that matches `.env.example`:

   ```bash
   docker run -d --name cyfurden-db -e POSTGRES_USER=cyfurden -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=cyfurden -p 127.0.0.1:55433:5432 postgres:16
   ```

2. Copy `.env.example` to `.env` and set `BETTER_AUTH_SECRET` to a random value of at least 32 bytes (for example `openssl rand -hex 32`). Next.js and the Prisma CLI both read `.env`; it is gitignored. Google sign-in, Oracle Object Storage, and Sentry are optional locally: leave their variables empty if you do not need them (image uploads need the Oracle settings).

3. Install dependencies (this also generates the Prisma client) and apply the migrations:

   ```bash
   npm install
   npx prisma migrate deploy
   ```

4. Optionally seed the public demo booth. The script reads `DATABASE_URL` from your shell, not from `.env`:

   ```bash
   export DATABASE_URL="postgresql://cyfurden:change-me@127.0.0.1:55433/cyfurden"
   npm run db:seed:demo
   ```

5. Start the app at http://localhost:3000 and create an account:

   ```bash
   npm run dev
   ```

Product records store Oracle object keys; the browser never receives Oracle credentials. Image uploads need the Oracle variables in `.env` and a bucket CORS rule for your local origin.

## Quality checks

All of these must pass before a change is committed:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npx prisma validate
```

`npm test` runs a production build first, then the unit and source tests. Database-backed integration suites are skipped unless enabled.

## Database integration tests

Run them only against a disposable database, never your development, a shared, or a production database:

```bash
docker run -d --name cyfurden-test-db -e POSTGRES_USER=cyfurden -e POSTGRES_PASSWORD=test -e POSTGRES_DB=cyfurden -p 127.0.0.1:55434:5432 postgres:16
export DATABASE_URL="postgresql://cyfurden:test@127.0.0.1:55434/cyfurden"
npx prisma migrate deploy
for flag in 4 5 6 10 12 13 14 15 16 17 17C 17D 17E 18; do
  export "CYFURDEN_PHASE${flag}_INTEGRATION=1"
done
for file in tests/*.integration.test.ts; do
  npx tsx --test --test-concurrency=1 "$file" || break
done
docker rm -f cyfurden-test-db
```

`npx prisma migrate deploy` uses the exported `DATABASE_URL`; `dotenv` does not override variables that are already set.

## Conventions

- Money is stored as BIGINT minor units (×100, including VND).
- Dates shown to people use Vietnam time (`Asia/Ho_Chi_Minh`): format through `lib/i18n/intl.ts` and parse wall-clock input through `lib/booth-time.ts`. ESLint rejects raw date formatters elsewhere.
- Payments are manual bank transfers only; the app never verifies or claims a successful payment.
