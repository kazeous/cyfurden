import { db } from "@/lib/db";
import { requireBoothServiceAccess } from "@/lib/platform-targets";

export async function saveCustomerTransferReference(input: {
  slug: string;
  code: string;
  customerTransferReference: string;
}) {
  return db.$transaction(async (transaction) => {
    const booth = await transaction.booth.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (!booth) return false;
    await requireBoothServiceAccess(booth.id, "MUTATION", transaction);
    const result = await transaction.order.updateMany({
      where: {
        code: input.code,
        boothId: booth.id,
        status: "PENDING",
      },
      data: {
        customerTransferReference: input.customerTransferReference,
      },
    });
    return result.count > 0;
  });
}
