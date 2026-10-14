import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "fb_session";

export function middleware(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/student/:path*"],
};
