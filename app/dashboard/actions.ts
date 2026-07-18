"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/authorization";
import { db } from "@/lib/db";
import { createDefaultStorefrontDocument } from "@/lib/storefront-document";

const boothSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters for the booth name.")
    .max(80, "Keep the booth name under 80 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Use at least 3 characters for the booth address.")
    .max(48, "Keep the booth address under 48 characters.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, and single hyphens only.",
    ),
});

export type CreateBoothState = {
  message?: string;
  fieldErrors?: {
    name?: string[];
    slug?: string[];
  };
};

export async function createBooth(
  _previousState: CreateBoothState,
  formData: FormData,
): Promise<CreateBoothState> {
  const session = await requireUser("/dashboard/new");
  const parsed = boothSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });

  if (!parsed.success) {
    return {
      message: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let boothId: string;

  try {
    boothId = await db.$transaction(async (transaction) => {
      const initialStorefrontDocument = createDefaultStorefrontDocument(
        parsed.data.name,
      );
      const booth = await transaction.booth.create({
        data: {
          name: parsed.data.name,
          slug: parsed.data.slug,
          ownerId: session.user.id,
          status: "PUBLISHED",
        },
        select: { id: true },
      });

      await Promise.all([
        transaction.boothMembership.create({
          data: {
            boothId: booth.id,
            userId: session.user.id,
            role: "OWNER",
            status: "ACTIVE",
          },
        }),
        transaction.storefrontConfig.create({
          data: {
            boothId: booth.id,
            draftDocument: initialStorefrontDocument,
            publishedDocument: initialStorefrontDocument,
            updatedById: session.user.id,
          },
        }),
        transaction.boothPaymentInstruction.create({
          data: {
            boothId: booth.id,
            bankName: "",
            accountName: "",
            accountNumber: "",
            instructions:
              "Add your bank-transfer instructions before accepting orders.",
            disclaimer:
              "Bank transfers are reviewed manually and are never verified automatically.",
          },
        }),
        transaction.gachaConfig.create({
          data: {
            boothId: booth.id,
            enabled: false,
            rates: {
              COMMON: 80,
              RARE: 15,
              EPIC: 4,
              LEGENDARY: 1,
            },
          },
        }),
        transaction.quantityPromotion.create({
          data: {
            boothId: booth.id,
            name: "Buy 3, get 1",
            active: false,
          },
        }),
      ]);

      return booth.id;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        message: "That booth address is already in use. Try another one.",
        fieldErrors: {
          slug: ["Choose a different booth address."],
        },
      };
    }

    console.error("Failed to create booth", error);
    return {
      message: "We could not create the booth right now. Please try again.",
    };
  }

  redirect(`/manage/${boothId}/orders`);
}
