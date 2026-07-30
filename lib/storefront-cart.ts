export type StorefrontCartLine = {
  productId: string;
  variantId: string;
  quantity: number;
};

export function removeLine(
  cart: readonly StorefrontCartLine[],
  variantId: string,
): StorefrontCartLine[] {
  return cart.flatMap((line) => (line.variantId === variantId ? [] : [line]));
}

export function clearCart(): StorefrontCartLine[] {
  return [];
}
