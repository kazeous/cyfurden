import { NextResponse, type NextRequest } from "next/server";
import { requestPathHeader } from "@/lib/i18n/request-path";

/**
 * Root layouts do not receive the active pathname. Forward a small,
 * server-only request header so the document language can be chosen before
 * the HTML shell is rendered.
 */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(requestPathHeader, request.nextUrl.pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/",
    "/sign-in",
    "/sign-up",
    "/dashboard/:path*",
    "/manage/:path*",
    "/invitations/:path*",
    "/s/:path*",
  ],
};
