export const PUBLIC_ORDER_MAX_LINES = 30;
export const PUBLIC_ORDER_MAX_QUANTITY = 99;

export const purchasableVariantStatuses = [
  "AVAILABLE",
  "LOW_STOCK",
  "PREORDER",
] as const;

export type PurchasableVariantStatus =
  (typeof purchasableVariantStatuses)[number];

export type OrderStatusName =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "EXPIRED"
  | "FULFILLED";

export const orderStatusTransitions: Record<
  OrderStatusName,
  readonly OrderStatusName[]
> = {
  PENDING: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["PENDING", "FULFILLED", "CANCELLED"],
  CANCELLED: [],
  EXPIRED: [],
  FULFILLED: [],
};

export function canTransitionOrderStatus(
  current: OrderStatusName,
  next: OrderStatusName,
) {
  return current === next || orderStatusTransitions[current].includes(next);
}

export function releasesInventory(status: OrderStatusName) {
  return status === "CANCELLED" || status === "EXPIRED";
}

export function isPurchasableVariant(
  status: string,
  stockQuantity: number | null,
) {
  return (
    purchasableVariantStatuses.includes(status as PurchasableVariantStatus) &&
    (stockQuantity === null || stockQuantity > 0)
  );
}

export function maximumPurchasableQuantity(stockQuantity: number | null) {
  return stockQuantity === null
    ? PUBLIC_ORDER_MAX_QUANTITY
    : Math.min(PUBLIC_ORDER_MAX_QUANTITY, Math.max(0, stockQuantity));
}

export type SubmittedOrderLine = {
  productId: string;
  variantId: string;
  quantity: number;
};

export function aggregateSubmittedOrderLines(lines: SubmittedOrderLine[]) {
  const byVariant = new Map<string, SubmittedOrderLine>();

  for (const line of lines) {
    const existing = byVariant.get(line.variantId);
    if (!existing) {
      byVariant.set(line.variantId, { ...line });
      continue;
    }
    if (existing.productId !== line.productId) {
      throw new Error("A variant cannot belong to more than one product.");
    }
    const quantity = existing.quantity + line.quantity;
    if (quantity > PUBLIC_ORDER_MAX_QUANTITY) {
      throw new Error(
        `A single item cannot exceed ${PUBLIC_ORDER_MAX_QUANTITY} units.`,
      );
    }
    existing.quantity = quantity;
  }

  return [...byVariant.values()];
}

export type PaymentInstructionSource = {
  bankName: string;
  bankCode?: string | null;
  accountName: string;
  accountNumber: string;
  paymentLabel?: string;
  qrObjectKey: string | null;
  instructions: string;
  disclaimer: string;
};

export type OrderPaymentSnapshot = PaymentInstructionSource & {
  bankCode: string | null;
  paymentLabel: string;
};

const clean = (value: string) => value.trim();

export function createOrderPaymentSnapshot(
  source: PaymentInstructionSource | null | undefined,
): OrderPaymentSnapshot | null {
  if (!source) return null;

  const snapshot = {
    bankName: clean(source.bankName),
    bankCode: clean(source.bankCode ?? "") || null,
    accountName: clean(source.accountName),
    accountNumber: clean(source.accountNumber),
    paymentLabel:
      clean(source.paymentLabel ?? "Bank transfer") || "Bank transfer",
    qrObjectKey: source.qrObjectKey?.trim() || null,
    instructions: clean(source.instructions),
    disclaimer: clean(source.disclaimer),
  };
  const hasCompleteBankAccount = Boolean(
    snapshot.bankName && snapshot.accountName && snapshot.accountNumber,
  );

  return (hasCompleteBankAccount || snapshot.qrObjectKey) &&
    snapshot.instructions &&
    snapshot.disclaimer
    ? snapshot
    : null;
}

export function readOrderPaymentSnapshot(
  value: unknown,
): OrderPaymentSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.bankName !== "string" ||
    typeof candidate.accountName !== "string" ||
    typeof candidate.accountNumber !== "string" ||
    !(
      candidate.bankCode === undefined ||
      candidate.bankCode === null ||
      typeof candidate.bankCode === "string"
    ) ||
    !(
      candidate.paymentLabel === undefined ||
      typeof candidate.paymentLabel === "string"
    ) ||
    !(
      candidate.qrObjectKey === null ||
      typeof candidate.qrObjectKey === "string"
    ) ||
    typeof candidate.instructions !== "string" ||
    typeof candidate.disclaimer !== "string"
  ) {
    return null;
  }

  return createOrderPaymentSnapshot({
    bankName: candidate.bankName,
    bankCode:
      candidate.bankCode === null || candidate.bankCode === undefined
        ? null
        : candidate.bankCode,
    accountName: candidate.accountName,
    accountNumber: candidate.accountNumber,
    paymentLabel: candidate.paymentLabel ?? "Bank transfer",
    qrObjectKey: candidate.qrObjectKey,
    instructions: candidate.instructions,
    disclaimer: candidate.disclaimer,
  });
}

export function renderTransferReference(
  template: string,
  orderCode: string,
  itemSummary = "order",
  amount = "",
) {
  const normalizedTemplate = template.trim() || "CYF-{ORDER}";
  const replacements: Record<string, string> = {
    "{ORDER}": orderCode,
    "{code}": orderCode,
    "{item}": itemSummary,
    "{amount}": amount,
  };
  const hasCodeToken =
    normalizedTemplate.includes("{ORDER}") ||
    normalizedTemplate.includes("{code}");
  const rendered = Object.entries(replacements).reduce(
    (value, [token, replacement]) => value.replaceAll(token, replacement),
    normalizedTemplate,
  );
  return hasCodeToken ? rendered : `${rendered} ${orderCode}`;
}
