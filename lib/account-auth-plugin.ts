import {
  APIError,
  createAuthEndpoint,
  sensitiveSessionMiddleware,
} from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import {
  ACCOUNT_EMAIL_MAX_INPUT,
  ACCOUNT_PASSWORD_MAX_LENGTH,
  ACCOUNT_SECOND_FACTOR_MAX_LENGTH,
} from "@/lib/account-credentials-validation";
import {
  AccountEmailChangeError,
  changeCurrentAccountEmail,
} from "@/lib/account-credentials";

const changeAccountEmailBody = z.object({
  newEmail: z.string().max(ACCOUNT_EMAIL_MAX_INPUT),
  confirmationEmail: z.string().max(ACCOUNT_EMAIL_MAX_INPUT),
  currentPassword: z.string().max(ACCOUNT_PASSWORD_MAX_LENGTH),
  secondFactorCode: z.string().max(ACCOUNT_SECOND_FACTOR_MAX_LENGTH).optional(),
});

function changeFailed() {
  return APIError.from("BAD_REQUEST", {
    code: "ACCOUNT_EMAIL_CHANGE_FAILED",
    message: "The account email could not be changed.",
  });
}

export function accountCredentialsPlugin() {
  return {
    id: "account-credentials",
    endpoints: {
      changeAccountEmail: createAuthEndpoint(
        "/account/change-email",
        {
          method: "POST",
          body: changeAccountEmailBody,
          use: [sensitiveSessionMiddleware],
        },
        async (context) => {
          const session = context.context.session;
          try {
            await changeCurrentAccountEmail({
              ...context.body,
              currentEmail: session.user.email,
              twoFactorRequired: session.user.twoFactorEnabled === true,
              userId: session.user.id,
              sessionId: session.session.id,
              sessionToken: session.session.token,
              secret: context.context.secretConfig,
            });
          } catch (error) {
            if (error instanceof AccountEmailChangeError) throw changeFailed();
            throw changeFailed();
          }

          deleteSessionCookie(context);
          return context.json(
            { status: true as const },
            { headers: { "Cache-Control": "no-store" } },
          );
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path: string) => path === "/account/change-email",
        window: 60,
        max: 5,
      },
    ],
  };
}
