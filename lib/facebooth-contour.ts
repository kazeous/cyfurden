import { FACEBOOTH_MAX_CONTOUR_POINTS } from "@/lib/facebooth-documents";

export type FaceboothContourPoint = {
  xMillionths: number;
  yMillionths: number;
};

export type AlphaContourResult = {
  points: FaceboothContourPoint[];
  opaqueFallback: boolean;
  source: "ALPHA" | "PRESET";
};

type PixelPoint = { x: number; y: number };
type Edge = { start: PixelPoint; end: PixelPoint };

const PRESET_OUTLINE: FaceboothContourPoint[] = [
  { xMillionths: 120_000, yMillionths: 0 },
  { xMillionths: 880_000, yMillionths: 0 },
  { xMillionths: 950_000, yMillionths: 25_000 },
  { xMillionths: 1_000_000, yMillionths: 100_000 },
  { xMillionths: 1_000_000, yMillionths: 900_000 },
  { xMillionths: 950_000, yMillionths: 975_000 },
  { xMillionths: 880_000, yMillionths: 1_000_000 },
  { xMillionths: 120_000, yMillionths: 1_000_000 },
  { xMillionths: 50_000, yMillionths: 975_000 },
  { xMillionths: 0, yMillionths: 900_000 },
  { xMillionths: 0, yMillionths: 100_000 },
  { xMillionths: 50_000, yMillionths: 25_000 },
];

function pointKey(point: PixelPoint) {
  return `${point.x}:${point.y}`;
}

function signedArea(points: PixelPoint[]) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[(index + 1) % points.length];
    area += point.x * next.y - next.x * point.y;
  }
  return area / 2;
}

function fillEnclosedGaps(mask: Uint8Array, width: number, height: number) {
  const outside = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  const enqueue = (x: number, y: number) => {
    const index = y * width + x;
    if (mask[index] || outside[index]) return;
    outside[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }

  const filled = mask.slice();
  for (let index = 0; index < filled.length; index += 1) {
    if (!filled[index] && !outside[index]) filled[index] = 1;
  }
  return filled;
}

function largestComponent(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let largest: number[] = [];
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || visited[seed]) continue;
    let head = 0;
    let tail = 0;
    const component: number[] = [];
    visited[seed] = 1;
    queue[tail++] = seed;
    while (head < tail) {
      const index = queue[head++];
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && mask[neighbour] && !visited[neighbour]) {
          visited[neighbour] = 1;
          queue[tail++] = neighbour;
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  const result = new Uint8Array(mask.length);
  for (const index of largest) result[index] = 1;
  return result;
}

function boundaryEdges(component: Uint8Array, width: number, height: number) {
  const edges: Edge[] = [];
  const occupied = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height
      ? component[y * width + x] === 1
      : false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!occupied(x, y)) continue;
      if (!occupied(x, y - 1))
        edges.push({ start: { x, y }, end: { x: x + 1, y } });
      if (!occupied(x + 1, y))
        edges.push({ start: { x: x + 1, y }, end: { x: x + 1, y: y + 1 } });
      if (!occupied(x, y + 1))
        edges.push({ start: { x: x + 1, y: y + 1 }, end: { x, y: y + 1 } });
      if (!occupied(x - 1, y))
        edges.push({ start: { x, y: y + 1 }, end: { x, y } });
    }
  }
  return edges;
}

function traceLargestLoop(edges: Edge[]) {
  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = pointKey(edge.start);
    outgoing.set(key, [...(outgoing.get(key) ?? []), index]);
  });
  const consumed = new Uint8Array(edges.length);
  const loops: PixelPoint[][] = [];
  for (let seed = 0; seed < edges.length; seed += 1) {
    if (consumed[seed]) continue;
    const loop: PixelPoint[] = [];
    let edgeIndex: number | undefined = seed;
    const start = edges[seed].start;
    while (edgeIndex !== undefined && !consumed[edgeIndex]) {
      const edge: Edge = edges[edgeIndex];
      consumed[edgeIndex] = 1;
      loop.push(edge.start);
      if (pointKey(edge.end) === pointKey(start)) break;
      edgeIndex = (outgoing.get(pointKey(edge.end)) ?? []).find(
        (candidate) => !consumed[candidate],
      );
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops.sort(
    (left, right) => Math.abs(signedArea(right)) - Math.abs(signedArea(left)),
  )[0];
}

function removeCollinear(points: PixelPoint[]) {
  return points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return (
      (point.x - previous.x) * (next.y - point.y) !==
      (point.y - previous.y) * (next.x - point.x)
    );
  });
}

function smoothClosed(points: PixelPoint[]) {
  let result = points;
  for (let pass = 0; pass < 2; pass += 1) {
    const smoothed: PixelPoint[] = [];
    for (let index = 0; index < result.length; index += 1) {
      const point = result[index];
      const next = result[(index + 1) % result.length];
      smoothed.push({
        x: point.x * 0.75 + next.x * 0.25,
        y: point.y * 0.75 + next.y * 0.25,
      });
      smoothed.push({
        x: point.x * 0.25 + next.x * 0.75,
        y: point.y * 0.25 + next.y * 0.75,
      });
    }
    result = smoothed;
  }
  return result;
}

function sampleBounded(points: PixelPoint[], maximum: number) {
  if (points.length <= maximum) return points;
  return Array.from(
    { length: maximum },
    (_, index) => points[Math.floor((index * points.length) / maximum)],
  );
}

export function createPresetFaceboothContour() {
  return PRESET_OUTLINE.map((point) => ({ ...point }));
}

export function traceFaceboothAlphaContour(input: {
  alpha: Uint8Array;
  width: number;
  height: number;
  alphaThreshold?: number;
  fillGaps?: boolean;
  maximumPoints?: number;
}): AlphaContourResult {
  const { width, height } = input;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    input.alpha.length !== width * height
  ) {
    throw new Error("Alpha masks must match positive integer dimensions.");
  }
  const maximumPoints = Math.max(
    3,
    Math.min(input.maximumPoints ?? FACEBOOTH_MAX_CONTOUR_POINTS, 256),
  );
  const threshold = Math.max(0, Math.min(input.alphaThreshold ?? 8, 255));
  let mask = Uint8Array.from(input.alpha, (alpha) =>
    alpha >= threshold ? 1 : 0,
  );
  if (mask.every((value) => value === 1)) {
    return {
      points: createPresetFaceboothContour(),
      opaqueFallback: true,
      source: "PRESET",
    };
  }
  if (input.fillGaps ?? true) mask = fillEnclosedGaps(mask, width, height);
  const component = largestComponent(mask, width, height);
  const loop = traceLargestLoop(boundaryEdges(component, width, height));
  if (!loop?.length) {
    return {
      points: createPresetFaceboothContour(),
      opaqueFallback: true,
      source: "PRESET",
    };
  }
  const simplified = sampleBounded(
    smoothClosed(removeCollinear(loop)),
    maximumPoints,
  );
  if (simplified.length < 3) {
    return {
      points: createPresetFaceboothContour(),
      opaqueFallback: true,
      source: "PRESET",
    };
  }
  return {
    points: simplified.map((point) => ({
      xMillionths: Math.round(
        Math.max(0, Math.min(1, point.x / width)) * 1_000_000,
      ),
      yMillionths: Math.round(
        (1 - Math.max(0, Math.min(1, point.y / height))) * 1_000_000,
      ),
    })),
    opaqueFallback: false,
    source: "ALPHA",
  };
}
