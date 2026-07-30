"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveCustomerTransferReference } from "@/lib/customer-transfer-reference";
import { parseLocale, translate } from "@/lib/i18n";

const referenceSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  code: z.string().trim().min(4).max(80),
  customerTransferReference: z.string().trim().min(2).max(120),
});

export type CustomerTransferReferenceState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function submitCustomerTransferReferenceAction(
  _previousState: CustomerTransferReferenceState,
  formData: FormData,
): Promise<CustomerTransferReferenceState> {
  const strings = translate(
    parseLocale(String(formData.get("locale") ?? "")),
    "publicReservation",
  );
  const parsed = referenceSchema.safeParse({
    slug: String(formData.get("slug") ?? ""),
    code: String(formData.get("code") ?? ""),
    customerTransferReference: String(
      formData.get("customerTransferReference") ?? "",
    ),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: strings.referenceInvalid,
    };
  }

  let updated: boolean;
  try {
    updated = await saveCustomerTransferReference(parsed.data);
  } catch (error) {
    console.error("Failed to save customer transfer reference", error);
    return {
      status: "error",
      message: strings.referenceSaveFailed,
    };
  }

  if (!updated) {
    return {
      status: "error",
      message: strings.referenceClosed,
    };
  }
  revalidatePath(
    `/s/${encodeURIComponent(parsed.data.slug)}/reservation/${encodeURIComponent(parsed.data.code)}`,
  );
  return {
    status: "success",
    message: strings.referenceSaved,
  };
}
