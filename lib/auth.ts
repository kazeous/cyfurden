import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, twoFactor } from "better-auth/plugins";
import { accountCredentialsPlugin } from "@/lib/account-auth-plugin";
import {
  ACCOUNT_PASSWORD_MAX_LENGTH,
  validatePasswordReplacement,
} from "@/lib/account-credentials-validation";
import { validateAccountDisplayName } from "@/lib/account-profile";
import { db } from "@/lib/db";
import {
  platformAuthAccessControl,
  platformAuthRoles,
} from "@/lib/platform-auth-access";

const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

function readTrustedOrigins(value: string | undefined) {
  if (!value) return [];

  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const url = new URL(entry);
          if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error(
              `BETTER_AUTH_TRUSTED_ORIGINS only accepts HTTP(S) origins: ${entry}`,
            );
          }
          if (url.pathname !== "/" || url.search || url.hash) {
            throw new Error(
              `BETTER_AUTH_TRUSTED_ORIGINS entries must not include a path, query, or hash: ${entry}`,
            );
          }
          return url.origin;
        }),
    ),
  );
}

const trustedOrigins = readTrustedOrigins(
  process.env.BETTER_AUTH_TRUSTED_ORIGINS,
);

export const auth = betterAuth({
  appName: "Cyfurden",
  baseURL: process.env.BETTER_AUTH_URL,
  ...(trustedOrigins.length ? { trustedOrigins } : {}),
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  session: {
    additionalFields: {
      platformAuthenticatedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        async before(session, context) {
          if (context?.path === "/change-password") {
            return {
              data: {
                ...session,
                platformAuthenticatedAt: null,
              },
            };
          }
          if (context?.path !== "/two-factor/verify-totp") return;
          const existingSession = context.context.session?.session as
            | { platformAuthenticatedAt?: Date | string | null }
            | null
            | undefined;
          if (existingSession && !existingSession.platformAuthenticatedAt) {
            return;
          }
          return {
            data: {
              ...session,
              platformAuthenticatedAt: new Date(),
            },
          };
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (context.path === "/change-password" && context.body) {
        const body = context.body as {
          currentPassword?: unknown;
          newPassword?: unknown;
          revokeOtherSessions?: unknown;
        };
        const validation = validatePasswordReplacement({
          currentPassword: body.currentPassword,
          newPassword: body.newPassword,
          confirmationPassword: body.newPassword,
        });
        if (
          !validation.ok ||
          body.revokeOtherSessions !== true ||
          validation.value.currentPassword.length > ACCOUNT_PASSWORD_MAX_LENGTH
        ) {
          throw APIError.from("BAD_REQUEST", {
            code: "INVALID_ACCOUNT_PASSWORD_REPLACEMENT",
            message: "The account password could not be changed.",
          });
        }
        return;
      }

      if (
        context.path !== "/update-user" ||
        !context.body ||
        !("name" in context.body)
      ) {
        return;
      }

      const result = validateAccountDisplayName(context.body.name);
      if (!result.ok) {
        throw APIError.from("BAD_REQUEST", {
          code: "INVALID_ACCOUNT_DISPLAY_NAME",
          message: "The account display name is invalid.",
        });
      }
      context.body.name = result.value;
    }),
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
        },
      }
    : {},
  plugins: [
    accountCredentialsPlugin(),
    admin({
      ac: platformAuthAccessControl,
      roles: platformAuthRoles,
      defaultRole: "user",
      bannedUserMessage: "This account is currently unavailable.",
    }),
    twoFactor({
      issuer: "Cyfurden",
      trustDeviceMaxAge: 0,
    }),
    nextCookies(),
  ],
});

export const isGoogleAuthEnabled = googleEnabled;
