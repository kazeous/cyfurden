import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);

let baseUrl;
let nextServer;
let serverOutput = "";

const productNames = [
  "Midnight Garden Riso Print",
  "Cloud Library Print",
  "Lantern Moth Pin",
  "Sleepy Comet Pin",
  "Tiny Night Market Sticker Sheet",
  "Rainy Day Postcard Set",
  "Last Tram Cat Charm",
  "Pocket Familiar Charm",
];

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to reserve a local test port."));
        return;
      }

      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (nextServer.exitCode !== null) {
      throw new Error(
        `Next.js exited before accepting requests.\n${serverOutput}`,
      );
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Next.js did not start within 30 seconds.\n${serverOutput}`);
}

before(async () => {
  const port = await reservePort();
  const nextCli = join(
    projectRoot,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );

  baseUrl = `http://127.0.0.1:${port}`;
  nextServer = spawn(process.execPath, [nextCli, "start"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  for (const stream of [nextServer.stdout, nextServer.stderr]) {
    stream.on("data", (chunk) => {
      serverOutput += chunk.toString();
    });
  }

  await waitForServer(baseUrl);
});

after(() => {
  nextServer?.kill();
});

async function render(pathname = "/") {
  return fetch(`${baseUrl}${pathname}`, {
    headers: { accept: "text/html" },
  });
}

test("server-renders the Cyfurden landing page", async () => {
  const response = await render();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const renderedContent = html.replace(/<!--\s*-->/g, "");

  assert.match(
    renderedContent,
    /<title>Cyfurden — Artist booths for convention days<\/title>/i,
  );
  assert.match(renderedContent, /A calmer booth for busy convention days/);
  assert.match(renderedContent, /From first scan to final handoff/);
  assert.match(renderedContent, /Payment stays manual—and visibly so/);
  assert.match(renderedContent, /href="\/sign-up"/);
  assert.match(renderedContent, /href="\/sign-in"/);
  assert.match(renderedContent, /href="\/s\/lantern-and-loom"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|stripe/i);
});

test("keeps the complete demo booth available on its public route", async () => {
  const response = await render("/s/lantern-and-loom");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const renderedContent = html.replace(/<!--\s*-->/g, "");

  assert.match(renderedContent, /Moonrise Makers Market/);
  assert.match(renderedContent, /Pocket-sized treasures/);
  assert.match(renderedContent, /8 of 8 pieces shown/);
  assert.match(renderedContent, /Manual bank transfer only/i);
  assert.match(renderedContent, /No payment gateway/i);

  const productCards = html.match(/<article class="product-card">/g) ?? [];
  assert.equal(productCards.length, 8);
  for (const productName of productNames) {
    assert.match(renderedContent, new RegExp(productName));
  }

  assert.doesNotMatch(html, /codex-preview/i);
  assert.doesNotMatch(html, /react-loading-skeleton/i);
  assert.doesNotMatch(html, /stripe/i);
});

test("keeps Oracle images and the browser cart wired to local content", async () => {
  const [client, boothData, imageResolver] = await Promise.all([
    readFile(new URL("../app/booth-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/booth-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/oracle-images.ts", import.meta.url), "utf8"),
  ]);

  assert.match(client, /resolveOracleImageUrl\(image\)/);
  assert.match(client, /resolveOracleImageUrl\(booth\.payment\.qrImage\)/);
  assert.match(boothData, /objectKey:\s*"booths\/lantern-and-loom\/products\//);
  assert.match(
    boothData,
    /objectKey:\s*"booths\/lantern-and-loom\/payment\/demo-bank-qr\.png"/,
  );
  assert.match(imageResolver, /NEXT_PUBLIC_ORACLE_OBJECT_BASE_URL/);
  assert.match(imageResolver, /segments\.map\(encodeObjectKeySegment\)/);
  assert.match(imageResolver, /return undefined/);

  assert.match(client, /const CART_STORAGE_KEY = "cyfurden-cart-v1"/);
  assert.match(client, /window\.localStorage\.getItem\(CART_STORAGE_KEY\)/);
  assert.match(
    client,
    /window\.localStorage\.setItem\(CART_STORAGE_KEY, JSON\.stringify\(cart\)\)/,
  );
  assert.match(client, /window\.localStorage\.removeItem\(CART_STORAGE_KEY\)/);

  assert.doesNotMatch(client, /codex-preview|react-loading-skeleton|stripe/i);
  assert.doesNotMatch(boothData, /stripe/i);
});

test("keeps bank details behind a successful managed reservation", async () => {
  const [storefront, action, confirmation, reservationPage] = await Promise.all(
    [
      readFile(
        new URL(
          "../components/storefront/managed-storefront.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../app/s/[slug]/actions.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../components/storefront/reservation-confirmation.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/s/[slug]/reservation/[code]/page.tsx", import.meta.url),
        "utf8",
      ),
    ],
  );

  assert.doesNotMatch(storefront, /paymentQrUrl|payment\.bankName|paymentQr/);
  assert.match(
    storefront,
    /receive manual bank-transfer instructions after\s+submitting/i,
  );
  assert.match(
    action,
    /\/reservation\/\$\{encodeURIComponent\(order\.code\)\}/,
  );
  assert.doesNotMatch(action, /\?order=/);

  assert.match(confirmation, /Reservation number/);
  assert.match(confirmation, /Bank transfer QR code/);
  assert.match(confirmation, /Account number/);
  assert.match(confirmation, /Reservation total/);
  assert.match(confirmation, /Transfer reference/);
  assert.match(confirmation, /does not verify\s+payment automatically/i);

  assert.match(reservationPage, /code,/);
  assert.match(reservationPage, /booth: \{ slug, status: "PUBLISHED" \}/);
  assert.match(
    reservationPage,
    /totalMinorUnits: order\.totalCents\.toString\(\)/,
  );
});
