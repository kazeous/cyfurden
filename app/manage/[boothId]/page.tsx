import { redirect } from "next/navigation";

export default async function ManageIndex({
  params,
}: {
  params: Promise<{ boothId: string }>;
}) {
  const { boothId } = await params;
  redirect(`/manage/${boothId}/orders`);
}
