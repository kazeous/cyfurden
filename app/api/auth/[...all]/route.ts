import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const handlers = toNextJsHandler(auth);
const blockedAdminPrefix = "/api/auth/admin/";
const totpVerificationPath = "/api/auth/two-factor/verify-totp";
const totpDisablePath = "/api/auth/two-factor/disable";

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
  const isTotpVerification = pathname === totpVerificationPath;
  const needsExistingSession =
    isTotpVerification || pathname === totpDisablePath;
  const existingSession = needsExistingSession
    ? await auth.api.getSession({ headers: request.headers })
    : null;
  if (pathname === totpDisablePath && existingSession) {
    const activeGrant = await db.platformRoleGrant.findFirst({
      where: { userId: existingSession.user.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (activeGrant) {
      return Response.json(
        {
          code: "PLATFORM_TOTP_REQUIRED",
          message: "Two-factor authentication is required for platform access.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  const response = await handlers.POST(request);

  if (
    isTotpVerification &&
    response.ok &&
    existingSession?.session.platformAuthenticatedAt
  ) {
    await db.session.updateMany({
      where: {
        id: existingSession.session.id,
        userId: existingSession.user.id,
      },
      data: { platformAuthenticatedAt: new Date() },
    });
  }

  return response;
}
