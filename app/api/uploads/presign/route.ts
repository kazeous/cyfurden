import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createBoothUploadPresign,
  presignedUploadRequestSchema,
} from "@/lib/oracle-presign";
import { requireBoothServiceAccess } from "@/lib/platform-targets";
import { StorageLedgerError } from "@/lib/storage-ledger";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Send a JSON upload request." },
      { status: 400 },
    );
  }

  const parsed = presignedUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid upload request." },
      { status: 400 },
    );
  }

  let session: Awaited<ReturnType<typeof auth.api.getSession>>;
  try {
    session = await auth.api.getSession({ headers: request.headers });
  } catch (error) {
    console.error("Presigned upload session lookup failed", error);
    return NextResponse.json(
      { error: "The upload could not be authorized." },
      { status: 500 },
    );
  }

  if (!session) {
    return NextResponse.json(
      { error: "Sign in to upload files." },
      { status: 401 },
    );
  }

  try {
    const membership = await db.boothMembership.findFirst({
      where: {
        boothId: parsed.data.boothId,
        userId: session.user.id,
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN"] },
      },
      select: { id: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You do not have permission to upload for this booth." },
        { status: 403 },
      );
    }

    await requireBoothServiceAccess(parsed.data.boothId, "MUTATION");

    const presign = await createBoothUploadPresign(parsed.data);
    return NextResponse.json(presign, { status: 200 });
  } catch (error) {
    if (
      error instanceof StorageLedgerError &&
      error.code === "STORAGE_QUOTA_EXCEEDED"
    ) {
      return NextResponse.json(
        {
          code: error.code,
          error:
            "This booth has reached its storage quota. Remove unused media or ask a platform operator to raise it.",
        },
        { status: 409 },
      );
    }
    console.error("Presigned booth upload creation failed", {
      error,
      purpose: parsed.data.purpose,
    });
    return NextResponse.json(
      { error: "Object storage uploads are not available right now." },
      { status: 503 },
    );
  }
}
