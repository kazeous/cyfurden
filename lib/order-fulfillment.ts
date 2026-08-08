import { z } from "zod";

export const orderFulfillmentMethods = ["PICKUP", "SHIP"] as const;
export type OrderFulfillmentMethod = (typeof orderFulfillmentMethods)[number];

export const CUSTOMER_PHONE_MAX_DIGITS = 10;
export const CUSTOMER_SOCIAL_CONTACT_MAX_LENGTH = 200;
export const SHIPPING_ADDRESS_MAX_LENGTH = 500;
export const SHIPMENT_CARRIER_MAX_LENGTH = 100;
export const SHIPMENT_TRACKING_NUMBER_MAX_LENGTH = 120;
export const SHIPMENT_TRACKING_URL_MAX_LENGTH = 500;

const printableSingleLine = (value: string) =>
  value.length > 0 && !/[\u0000-\u001f\u007f]/.test(value);

const optionalSingleLine = (maximumLength: number) =>
  z
    .string()
    .trim()
    .max(maximumLength)
    .refine((value) => !value || printableSingleLine(value))
    .transform((value) => value || null);

const optionalSocialContact = z
  .string()
  .trim()
  .max(CUSTOMER_SOCIAL_CONTACT_MAX_LENGTH)
  .refine((value) => !value || printableSingleLine(value))
  .refine((value) => {
    if (!value || !/^[a-z][a-z0-9+.-]*:/i.test(value)) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  })
  .transform((value) => value || null);

export function normalizeShippingAddress(value: string) {
  return value
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const publicOrderFulfillmentSchema = z
  .object({
    fulfillmentMethod: z.enum(orderFulfillmentMethods),
    customerPhone: z
      .string()
      .trim()
      .regex(new RegExp(`^[0-9]{1,${CUSTOMER_PHONE_MAX_DIGITS}}$`)),
    customerSocialContact: optionalSocialContact,
    shippingAddress: z
      .string()
      .transform(normalizeShippingAddress)
      .pipe(
        z
          .string()
          .max(SHIPPING_ADDRESS_MAX_LENGTH)
          .refine(
            (value) =>
              !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
          ),
      ),
  })
  .superRefine((value, context) => {
    if (value.fulfillmentMethod === "SHIP" && !value.shippingAddress) {
      context.addIssue({
        code: "custom",
        path: ["shippingAddress"],
        message: "A shipping address is required for shipped orders.",
      });
    }
  })
  .transform((value) => ({
    ...value,
    shippingAddress:
      value.fulfillmentMethod === "SHIP" ? value.shippingAddress : null,
  }));

export const orderShipmentSchema = z.object({
  carrier: optionalSingleLine(SHIPMENT_CARRIER_MAX_LENGTH),
  trackingNumber: optionalSingleLine(SHIPMENT_TRACKING_NUMBER_MAX_LENGTH),
  trackingUrl: z
    .string()
    .trim()
    .max(SHIPMENT_TRACKING_URL_MAX_LENGTH)
    .refine((value) => !value || printableSingleLine(value))
    .refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    })
    .transform((value) => value || null),
});

export type OrderShipmentInput = z.input<typeof orderShipmentSchema>;
