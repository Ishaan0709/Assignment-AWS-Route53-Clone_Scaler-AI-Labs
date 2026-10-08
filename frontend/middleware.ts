import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "session";
const LOGIN_PATH = "/login";

/**
 * Instant redirect for signed-out visitors: no cookie means no session, so send
 * them to the login page before the console shell even renders. The cookie is
 * validated for real by `/api/auth/me` inside the console layout.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith(LOGIN_PATH)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = LOGIN_PATH;
  loginUrl.search = "";
  if (pathname !== "/") loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except API proxying, Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
