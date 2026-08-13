"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/authorization";
import { isReservedBoothSlug } from "@/lib/demo-booth";
import { DEFAULT_GACHA_RATES } from "@/lib/gacha-rates";
import { readLocaleCookie } from "@/lib/i18n/server-locale";
import { getWorkspaceStrings } from "@/lib/i18n/workspace";
import { checkOwnedBoothQuota } from "@/lib/platform-quotas";
import { runSerializableTransaction } from "@/lib/serializable-transaction";
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

  let boothResult: { id: string | null; limit: number } | null = null;

  try {
    boothResult = await runSerializableTransaction(async (transaction) => {
      const quota = await checkOwnedBoothQuota(transaction, session.user.id);
      if (!quota.allowed) return { id: null, limit: quota.limit };

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

      return { id: booth.id, limit: quota.limit };
    });

    if (!boothResult.id) {
      return {
        message: strings.boothLimit(boothResult.limit),
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

  redirect(`/manage/${boothResult.id}/storefront`);
}
