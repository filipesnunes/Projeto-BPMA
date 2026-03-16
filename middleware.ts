import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth-session";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/acesso-negado"
  );
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
  const isPublic = isPublicPath(pathname);
  const clearSession = request.nextUrl.searchParams.get("clearSession") === "1";

  if (clearSession) {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("clearSession");

    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      path: "/",
      expires: new Date(0),
      httpOnly: true,
      sameSite: "lax"
    });

    return response;
  }

  if (!token && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/" && pathname !== "/trocar-senha") {
      loginUrl.searchParams.set("next", pathname);
    }

    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  return NextResponse.next({
    request: { headers: requestHeaders }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
