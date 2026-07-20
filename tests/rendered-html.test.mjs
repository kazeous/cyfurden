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
  assert.doesNotMatch(renderedContent, /lantern-and-loom|Lantern &amp; Loom/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|stripe/i);
});

test("uses one bundled display and body font system", async () => {
  const [layout, globals, tokens, storefront, auth] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../components/storefront/managed-storefront.module.css",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../components/auth/auth.module.css", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(layout, /@fontsource-variable\/manrope\/wght\.css/);
  assert.match(layout, /@fontsource-variable\/ibm-plex-sans\/wght\.css/);
  assert.match(tokens, /--font-display:\s*"Manrope Variable"/);
  assert.match(tokens, /--font-body:\s*"IBM Plex Sans Variable"/);
  assert.match(globals, /h1,[\s\S]*font-family: var\(--font-display\)/);
  assert.doesNotMatch(
    `${tokens}${storefront}${auth}`,
    /Georgia|Times New Roman|\bInter\b/,
  );
});

test("does not expose the removed Lantern & Loom demo booth", async () => {
  const response = await render("/s/lantern-and-loom");

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const renderedContent = html.replace(/<!--\s*-->/g, "");

  assert.match(renderedContent, /This page could not be found/i);
  assert.doesNotMatch(
    renderedContent,
    /Moonrise Makers Market|Midnight Garden|Lantern &amp; Loom/i,
  );
});

test("keeps Oracle images wired to managed storefront content", async () => {
  const [storefront, reservationPage, imageResolver] = await Promise.all([
    readFile(
      new URL(
        "../components/storefront/managed-storefront.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/s/[slug]/reservation/[code]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/oracle-images.ts", import.meta.url), "utf8"),
  ]);

  assert.match(storefront, /resolveOracleImageUrl\(image\)/);
  assert.match(
    reservationPage,
    /resolveOracleImageUrl\(\{ objectKey: payment\.qrObjectKey \}\)/,
  );
  assert.match(imageResolver, /NEXT_PUBLIC_ORACLE_OBJECT_BASE_URL/);
  assert.match(imageResolver, /segments\.map\(encodeObjectKeySegment\)/);
  assert.match(imageResolver, /return undefined/);

  assert.doesNotMatch(
    `${storefront}${reservationPage}`,
    /lantern-and-loom|booth-data|BoothClient|stripe/i,
  );
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
