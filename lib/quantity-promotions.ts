export const MAX_PROMOTION_QUANTITY = 99;

export type QuantityPromotionRule = {
  id: string;
  name: string;
  buyQuantity: number;
  rewardQuantity: number;
  repeatable: boolean;
  buyProductIds: readonly string[];
  rewardProductIds: readonly string[];
};

export type PromotionPricingLine = {
  lineId: string;
  productId: string;
  quantity: number;
  unitPriceMinorUnits: bigint | number | string;
};

export type PromotionAllocation = {
  promotionId: string;
  promotionName: string;
  quantity: number;
};

export type PromotionPricedLine = PromotionPricingLine & {
  unitPriceMinorUnits: bigint;
  paidQuantity: number;
  freeQuantity: number;
  subtotalMinorUnits: bigint;
  totalMinorUnits: bigint;
  allocations: PromotionAllocation[];
};

export type PromotionProgress = {
  promotionId: string;
  promotionName: string;
  buyQuantity: number;
  rewardQuantity: number;
  repeatable: boolean;
  appliedRewardQuantity: number;
  unclaimedRewardQuantity: number;
  remainingBuyQuantity: number;
  savingsMinorUnits: bigint;
};

export type QuantityPromotionPricing = {
  lines: PromotionPricedLine[];
  progress: PromotionProgress[];
  subtotalMinorUnits: bigint;
  discountMinorUnits: bigint;
  totalMinorUnits: bigint;
};

const asMinorUnits = (value: bigint | number | string) => {
  if (typeof value === "bigint") return value;
  return BigInt(value);
};

const validRule = (rule: QuantityPromotionRule) =>
  Boolean(rule.id.trim()) &&
  Number.isInteger(rule.buyQuantity) &&
  rule.buyQuantity >= 1 &&
  rule.buyQuantity <= MAX_PROMOTION_QUANTITY &&
  Number.isInteger(rule.rewardQuantity) &&
  rule.rewardQuantity >= 1 &&
  rule.rewardQuantity <= MAX_PROMOTION_QUANTITY &&
  rule.buyProductIds.length > 0 &&
  rule.rewardProductIds.length > 0;

/**
 * Prices cart lines using ordered, active promotion rules.
 *
 * Reward-only products are allocated before products that also qualify as
 * buy products. That preserves paid qualifying units for same-product offers:
 * a "buy 3, get 1" offer therefore needs four units, not three. Once a unit
 * is free it cannot be allocated by a later promotion.
 */
export function applyQuantityPromotions(
  inputLines: readonly PromotionPricingLine[],
  rules: readonly QuantityPromotionRule[],
): QuantityPromotionPricing {
  const seenLineIds = new Set<string>();
  const lines = inputLines.map((line) => {
    if (
      !line.lineId ||
      seenLineIds.has(line.lineId) ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1
    ) {
      throw new RangeError(
        "Promotion pricing requires unique, positive lines.",
      );
    }
    seenLineIds.add(line.lineId);
    const unitPriceMinorUnits = asMinorUnits(line.unitPriceMinorUnits);
    if (unitPriceMinorUnits < BigInt(0)) {
      throw new RangeError("Promotion pricing cannot use a negative price.");
    }
    return { ...line, unitPriceMinorUnits };
  });

  const allocatedByLine = new Map<
    string,
    { freeQuantity: number; allocations: PromotionAllocation[] }
  >(lines.map((line) => [line.lineId, { freeQuantity: 0, allocations: [] }]));
  const progress: PromotionProgress[] = [];

  for (const rule of rules) {
    if (!validRule(rule)) continue;

    const buyProductIds = new Set(rule.buyProductIds);
    const rewardProductIds = new Set(rule.rewardProductIds);
    const availableForLine = (line: (typeof lines)[number]) =>
      line.quantity - (allocatedByLine.get(line.lineId)?.freeQuantity ?? 0);
    const paidBuyQuantity = lines.reduce(
      (total, line) =>
        buyProductIds.has(line.productId)
          ? total + availableForLine(line)
          : total,
      0,
    );
    const rewardOnlyLines = lines.filter(
      (line) =>
        rewardProductIds.has(line.productId) &&
        !buyProductIds.has(line.productId) &&
        availableForLine(line) > 0,
    );
    const overlappingLines = lines.filter(
      (line) =>
        rewardProductIds.has(line.productId) &&
        buyProductIds.has(line.productId) &&
        availableForLine(line) > 0,
    );
    const rewardOnlyAvailable = rewardOnlyLines.reduce(
      (total, line) => total + availableForLine(line),
      0,
    );
    const overlappingAvailable = overlappingLines.reduce(
      (total, line) => total + availableForLine(line),
      0,
    );
    const rewardAvailable = rewardOnlyAvailable + overlappingAvailable;
    const buyGroupLimit = rule.repeatable
      ? Math.floor(paidBuyQuantity / rule.buyQuantity)
      : paidBuyQuantity >= rule.buyQuantity
        ? 1
        : 0;
    const rewardGroupLimit = Math.floor(rewardAvailable / rule.rewardQuantity);
    let appliedGroupCount = Math.min(buyGroupLimit, rewardGroupLimit);

    while (appliedGroupCount > 0) {
      const requestedRewards = appliedGroupCount * rule.rewardQuantity;
      const requiredOverlappingRewards = Math.max(
        0,
        requestedRewards - rewardOnlyAvailable,
      );
      if (
        requiredOverlappingRewards <= overlappingAvailable &&
        paidBuyQuantity - requiredOverlappingRewards >=
          appliedGroupCount * rule.buyQuantity
      ) {
        break;
      }
      appliedGroupCount -= 1;
    }

    let rewardsToAllocate = appliedGroupCount * rule.rewardQuantity;
    let overlappingRewards = 0;
    let savingsMinorUnits = BigInt(0);
    for (const line of [...rewardOnlyLines, ...overlappingLines]) {
      if (rewardsToAllocate === 0) break;
      const quantity = Math.min(availableForLine(line), rewardsToAllocate);
      if (!quantity) continue;
      const allocation = allocatedByLine.get(line.lineId);
      if (!allocation) continue;
      allocation.freeQuantity += quantity;
      allocation.allocations.push({
        promotionId: rule.id,
        promotionName: rule.name.trim() || "Quantity promotion",
        quantity,
      });
      if (buyProductIds.has(line.productId)) {
        overlappingRewards += quantity;
      }
      savingsMinorUnits += line.unitPriceMinorUnits * BigInt(quantity);
      rewardsToAllocate -= quantity;
    }

    const appliedRewardQuantity =
      appliedGroupCount * rule.rewardQuantity - rewardsToAllocate;
    const paidBuyAfterRewards = paidBuyQuantity - overlappingRewards;
    const earnedRewardQuantity = rule.repeatable
      ? Math.floor(paidBuyAfterRewards / rule.buyQuantity) * rule.rewardQuantity
      : paidBuyAfterRewards >= rule.buyQuantity
        ? rule.rewardQuantity
        : 0;
    const unclaimedRewardQuantity = Math.max(
      0,
      earnedRewardQuantity - appliedRewardQuantity,
    );
    const remainingBuyQuantity =
      unclaimedRewardQuantity > 0 ||
      (!rule.repeatable && appliedRewardQuantity > 0)
        ? 0
        : rule.buyQuantity - (paidBuyAfterRewards % rule.buyQuantity || 0);

    progress.push({
      promotionId: rule.id,
      promotionName: rule.name.trim() || "Quantity promotion",
      buyQuantity: rule.buyQuantity,
      rewardQuantity: rule.rewardQuantity,
      repeatable: rule.repeatable,
      appliedRewardQuantity,
      unclaimedRewardQuantity,
      remainingBuyQuantity,
      savingsMinorUnits,
    });
  }

  const pricedLines = lines.map<PromotionPricedLine>((line) => {
    const allocation = allocatedByLine.get(line.lineId) ?? {
      freeQuantity: 0,
      allocations: [],
    };
    const paidQuantity = line.quantity - allocation.freeQuantity;
    return {
      ...line,
      paidQuantity,
      freeQuantity: allocation.freeQuantity,
      subtotalMinorUnits: line.unitPriceMinorUnits * BigInt(line.quantity),
      totalMinorUnits: line.unitPriceMinorUnits * BigInt(paidQuantity),
      allocations: allocation.allocations,
    };
  });
  const subtotalMinorUnits = pricedLines.reduce(
    (total, line) => total + line.subtotalMinorUnits,
    BigInt(0),
  );
  const totalMinorUnits = pricedLines.reduce(
    (total, line) => total + line.totalMinorUnits,
    BigInt(0),
  );

  return {
    lines: pricedLines,
    progress,
    subtotalMinorUnits,
    discountMinorUnits: subtotalMinorUnits - totalMinorUnits,
    totalMinorUnits,
  };
}
