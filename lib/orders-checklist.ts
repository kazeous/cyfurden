import {
  createOrderPaymentSnapshot,
  type PaymentInstructionSource,
} from "./order-rules";

export type OrdersChecklistFacts = {
  hasLiveProduct: boolean;
  payment: PaymentInstructionSource | null | undefined;
  storefront:
    | {
        name: string;
        introduction: string;
        eventVenue: string;
        eventHours: string;
      }
    | null
    | undefined;
};

export type OrdersChecklistItem = {
  key: "live-product" | "payment" | "name" | "description" | "event";
  label: string;
  destination: "products" | "storefront";
  complete: boolean;
};

export function evaluateBoothChecklist(
  facts: OrdersChecklistFacts,
): OrdersChecklistItem[] {
  const storefront = facts.storefront;

  return [
    {
      key: "live-product",
      label: "Publish at least one product",
      destination: "products",
      complete: facts.hasLiveProduct,
    },
    {
      key: "payment",
      label: "Configure payment details",
      destination: "storefront",
      complete: Boolean(createOrderPaymentSnapshot(facts.payment)),
    },
    {
      key: "name",
      label: "Provide a booth name",
      destination: "storefront",
      complete: Boolean(storefront?.name.trim()),
    },
    {
      key: "description",
      label: "Provide a booth description",
      destination: "storefront",
      complete: Boolean(storefront?.introduction.trim()),
    },
    {
      key: "event",
      label: "Provide event location and hours",
      destination: "storefront",
      complete: Boolean(
        storefront?.eventVenue.trim() && storefront.eventHours.trim(),
      ),
    },
  ];
}
