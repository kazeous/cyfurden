import {
  APIError,
  createAuthEndpoint,
  sensitiveSessionMiddleware,
} from "better-auth/api";
import { z } from "zod";
import { ACCOUNT_PASSWORD_MAX_LENGTH } from "@/lib/account-credentials-validation";
import { ACCOUNT_TOTP_FACTOR_MAX_LENGTH } from "@/lib/account-totp-validation";
import {
  AccountTotpError,
  beginAccountTotpChange,
  cancelAccountTotpChange,
  confirmAccountTotpChange,
  disableAccountTotp,
} from "@/lib/account-totp";

const beginBody = z.object({
  currentPassword: z.string().max(ACCOUNT_PASSWORD_MAX_LENGTH),
  purpose: z.enum(["enable", "resync"]),
});

const confirmBody = z.object({ code: z.string().max(6) });

const disableBody = z.object({
  currentPassword: z.string().max(ACCOUNT_PASSWORD_MAX_LENGTH),
  currentFactorCode: z.string().max(ACCOUNT_TOTP_FACTOR_MAX_LENGTH),
  confirmDisable: z.literal(true),
});

function genericFailure() {
  return APIError.from("BAD_REQUEST", {
    code: "ACCOUNT_TOTP_CHANGE_FAILED",
    message: "Authenticator settings could not be changed.",
  });
}

function platformConstraint() {
  return APIError.from("FORBIDDEN", {
    code: "PLATFORM_TOTP_REQUIRED",
    message: "Two-factor authentication is required for platform access.",
  });
}

function sessionInput(session: {
  user: { id: string };
  session: { id: string; token: string };
}) {
  return {
    userId: session.user.id,
    sessionId: session.session.id,
    sessionToken: session.session.token,
  };
}

async function translateFailure<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof AccountTotpError &&
      error.code === "PLATFORM_TOTP_REQUIRED"
    ) {
      throw platformConstraint();
    }
    throw genericFailure();
  }
}

export function accountTotpPlugin() {
  return {
    id: "account-totp",
    endpoints: {
      beginAccountTotp: createAuthEndpoint(
        "/account/totp/begin",
        {
          method: "POST",
          body: beginBody,
          use: [sensitiveSessionMiddleware],
        },
        async (context) => {
          const result = await translateFailure(() =>
            beginAccountTotpChange({
              ...sessionInput(context.context.session),
              ...context.body,
            }),
          );
          return context.json(result, {
            headers: { "Cache-Control": "no-store" },
          });
        },
      ),
      confirmAccountTotp: createAuthEndpoint(
        "/account/totp/confirm",
        {
          method: "POST",
          body: confirmBody,
          use: [sensitiveSessionMiddleware],
        },
        async (context) => {
          const result = await translateFailure(() =>
            confirmAccountTotpChange({
              ...sessionInput(context.context.session),
              ...context.body,
            }),
          );
          return context.json(result, {
            headers: { "Cache-Control": "no-store" },
          });
        },
      ),
      disableAccountTotp: createAuthEndpoint(
        "/account/totp/disable",
        {
          method: "POST",
          body: disableBody,
          use: [sensitiveSessionMiddleware],
        },
        async (context) => {
          const result = await translateFailure(() =>
            disableAccountTotp({
              ...sessionInput(context.context.session),
              ...context.body,
            }),
          );
          return context.json(result, {
            headers: { "Cache-Control": "no-store" },
          });
        },
      ),
      cancelAccountTotp: createAuthEndpoint(
        "/account/totp/cancel",
        {
          method: "POST",
          use: [sensitiveSessionMiddleware],
        },
        async (context) => {
          const result = await translateFailure(() =>
            cancelAccountTotpChange(sessionInput(context.context.session)),
          );
          return context.json(result, {
            headers: { "Cache-Control": "no-store" },
          });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path: string) => path.startsWith("/account/totp/"),
        window: 60,
        max: 8,
      },
    ],
  };
}
