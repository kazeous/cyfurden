"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveCustomerTransferReference } from "@/lib/customer-transfer-reference";

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
      message: "Enter the transfer reference shown by your bank receipt.",
    };
  }

  let updated: boolean;
  try {
    updated = await saveCustomerTransferReference(parsed.data);
  } catch (error) {
    console.error("Failed to save customer transfer reference", error);
    return {
      status: "error",
      message: "The transfer reference could not be saved. Try again.",
    };
  }

  if (!updated) {
    return {
      status: "error",
      message: "This reservation is no longer accepting transfer details.",
    };
  }
  revalidatePath(
    `/s/${encodeURIComponent(parsed.data.slug)}/reservation/${encodeURIComponent(parsed.data.code)}`,
  );
  return {
    status: "success",
    message:
      "Transfer reference submitted. The booth owner will review it manually.",
  };
}
