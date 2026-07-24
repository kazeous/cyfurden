import { db } from "@/lib/db";

export async function saveCustomerTransferReference(input: {
  slug: string;
  code: string;
  customerTransferReference: string;
}) {
  const result = await db.order.updateMany({
    where: {
      code: input.code,
      booth: { slug: input.slug },
      status: "PENDING",
    },
    data: {
      customerTransferReference: input.customerTransferReference,
    },
  });
  return result.count > 0;
}
