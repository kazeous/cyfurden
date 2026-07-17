import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the complete Cyfurden booth", async () => {
  const response = await render();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const renderedContent = html.replace(/<!--\s*-->/g, "");

  assert.match(
    renderedContent,
    /<title>[^<]*Cyfurden[^<]*Lantern &amp; Loom Booth<\/title>/i,
  );
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
