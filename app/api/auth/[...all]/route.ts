import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { recordAccountTotpFactorProof } from "@/lib/account-totp";
import { db } from "@/lib/db";

const handlers = toNextJsHandler(auth);
const blockedAdminPrefix = "/api/auth/admin/";
const factorVerificationPaths = new Set([
  "/api/auth/two-factor/verify-totp",
  "/api/auth/two-factor/verify-backup-code",
]);
const blockedTotpMutationPaths = new Set([
  "/api/auth/two-factor/enable",
  "/api/auth/two-factor/disable",
  "/api/auth/two-factor/get-totp-uri",
  "/api/auth/two-factor/generate-backup-codes",
]);
const accountTotpPrefix = "/api/auth/account/totp/";
const factorPurposeHeader = "x-cyfurden-factor-purpose";
const lifecycleFactorPurpose = "account-totp-lifecycle";
const passwordChangePath = "/api/auth/change-password";
const emailChangePath = "/api/auth/account/change-email";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isBlockedAdminRoute(request: Request) {
  const pathname = new URL(request.url).pathname;
  return (
    pathname === blockedAdminPrefix.slice(0, -1) ||
    pathname.startsWith(blockedAdminPrefix)
  );
}

function hiddenRouteResponse() {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  if (isBlockedAdminRoute(request)) return hiddenRouteResponse();
  return handlers.GET(request);
}

export async function POST(request: Request) {
  if (isBlockedAdminRoute(request)) return hiddenRouteResponse();

  const pathname = new URL(request.url).pathname;
  if (blockedTotpMutationPaths.has(pathname)) {
    if (pathname === "/api/auth/two-factor/disable") {
      const session = await auth.api.getSession({ headers: request.headers });
      if (session) {
        const activeGrant = await db.platformRoleGrant.findFirst({
          where: { userId: session.user.id, status: "ACTIVE" },
          select: { id: true },
        });
        if (activeGrant) {
          return Response.json(
            {
              code: "PLATFORM_TOTP_REQUIRED",
              message:
                "Two-factor authentication is required for platform access.",
            },
            { status: 403, headers: { "Cache-Control": "no-store" } },
          );
        }
      }
    }
    return hiddenRouteResponse();
  }
  if (pathname === passwordChangePath) {
    const passwordSession = await auth.api.getSession({
      headers: request.headers,
    });
    if (passwordSession) {
      const user = await db.user.findUnique({
        where: { id: passwordSession.user.id },
        select: { banned: true, banExpires: true },
      });
      const currentlyBanned =
        user?.banned === true &&
        (!user.banExpires || user.banExpires.getTime() > Date.now());
      if (currentlyBanned) {
        return Response.json(
          {
            code: "ACCOUNT_UNAVAILABLE",
            message: "The account password could not be changed.",
          },
          { status: 403, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
  }
  const isFactorVerification = factorVerificationPaths.has(pathname);
  const needsExistingSession = isFactorVerification;
  const existingSession = needsExistingSession
    ? await auth.api.getSession({ headers: request.headers })
    : null;
  const lifecycleVerification =
    request.headers.get(factorPurposeHeader) === lifecycleFactorPurpose;
  const response = await handlers.POST(request);

  if (isFactorVerification && response.ok && existingSession) {
    if (lifecycleVerification) {
      await recordAccountTotpFactorProof({
        userId: existingSession.user.id,
        sessionId: existingSession.session.id,
      });
    } else {
      await db.session.updateMany({
        where: {
          id: existingSession.session.id,
          userId: existingSession.user.id,
        },
        data: { platformAuthenticatedAt: new Date() },
      });
    }
  }

  return pathname === passwordChangePath ||
    pathname === emailChangePath ||
    pathname.startsWith(accountTotpPrefix) ||
    isFactorVerification
    ? noStore(response)
    : response;
}
