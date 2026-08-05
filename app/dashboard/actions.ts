"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/authorization";
import { canOwnAnotherBooth } from "@/lib/booth-limit";
import { db } from "@/lib/db";
import { isReservedBoothSlug } from "@/lib/demo-booth";
import { DEFAULT_GACHA_RATES } from "@/lib/gacha-rates";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { createDefaultStorefrontDocument } from "@/lib/storefront-document";
import {
  defaultPaymentContent,
  defaultPromotionName,
} from "@/lib/system-content";

const boothSchema = (
  strings: ReturnType<typeof getWorkspaceStrings>["actions"],
) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(2, strings.boothNameMin)
      .max(80, strings.boothNameMax),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, strings.boothSlugMin)
      .max(48, strings.boothSlugMax)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, strings.boothSlugPattern)
      .refine((slug) => !isReservedBoothSlug(slug), strings.boothSlugReserved),
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
  const [session, locale] = await Promise.all([
    requireUser("/dashboard/new"),
    readLocaleCookie(),
  ]);
  const strings = getWorkspaceStrings(locale).actions;
  const parsed = boothSchema(strings).safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });

  if (!parsed.success) {
    return {
      message: strings.checkFields,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let boothId: string | null = null;

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        boothId = await db.$transaction(
          async (transaction) => {
            const ownedBoothCount = await transaction.booth.count({
              where: { ownerId: session.user.id },
            });
            if (!canOwnAnotherBooth(ownedBoothCount)) return null;

            const initialStorefrontDocument = createDefaultStorefrontDocument(
              parsed.data.name,
            );
            const booth = await transaction.booth.create({
              data: {
                name: parsed.data.name,
                slug: parsed.data.slug,
                ownerId: session.user.id,
                status: "DRAFT",
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
                  updatedById: session.user.id,
                },
              }),
              transaction.boothPaymentInstruction.create({
                data: {
                  boothId: booth.id,
                  bankName: "",
                  bankCode: null,
                  accountName: "",
                  accountNumber: "",
                  paymentLabel: defaultPaymentContent.label,
                  instructions: defaultPaymentContent.instructions,
                  disclaimer: defaultPaymentContent.disclaimer,
                },
              }),
              transaction.gachaConfig.create({
                data: {
                  boothId: booth.id,
                  enabled: false,
                  rates: { ...DEFAULT_GACHA_RATES },
                },
              }),
              transaction.quantityPromotion.create({
                data: {
                  boothId: booth.id,
                  name: defaultPromotionName,
                  active: false,
                },
              }),
            ]);

            return booth.id;
          },
          {
            isolationLevel: "Serializable",
          },
        );

        break;
      } catch (error) {
        const isSerializationConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034";
        if (isSerializationConflict && attempt < 2) continue;
        throw error;
      }
    }

    if (!boothId) {
      return {
        message: strings.boothLimit,
      };
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        message: strings.boothSlugUsed,
        fieldErrors: {
          slug: [strings.chooseDifferentSlug],
        },
      };
    }

    console.error("Failed to create booth", error);
    return {
      message: strings.boothCreateFailed,
    };
  }

  redirect(`/manage/${boothId}/storefront`);
}
