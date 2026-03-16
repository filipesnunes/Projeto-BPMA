import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { canAccessPath, type UserRole } from "@/lib/rbac";

const SESSION_COOKIE_NAME = "bpma_session";

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/acesso-negado"
  );
}

function buildLoginRedirect(request: NextRequest, nextPath?: string): URL {
  const loginUrl = new URL("/login", request.url);
  if (nextPath) {
    loginUrl.searchParams.set("next", nextPath);
  }

  return loginUrl;
}

function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    path: "/",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax"
  });
}

type SessionPayload =
  | {
      authenticated: true;
      user: {
        perfil: UserRole;
        obrigarTrocaSenha: boolean;
      };
    }
  | {
      authenticated: false;
    };

async function readSessionFromRuntime(request: NextRequest): Promise<SessionPayload | null> {
  try {
    const sessionUrl = new URL("/api/auth/session", request.url);
    const response = await fetch(sessionUrl, {
      method: "GET",
      headers: {
        cookie: request.headers.get("cookie") ?? ""
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as SessionPayload;
    if (!payload || typeof payload !== "object" || !("authenticated" in payload)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  return handleMiddleware(request);
}

async function handleMiddleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const isPublic = isPublicPath(pathname);
  const isLogin = pathname === "/login" || pathname.startsWith("/login/");
  const isTrocarSenha = pathname.startsWith("/trocar-senha");
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();

  if (!token) {
    if (isPublic) {
      return NextResponse.next();
    }

    const shouldSetNext = pathname !== "/" && !isTrocarSenha;
    return NextResponse.redirect(buildLoginRedirect(request, shouldSetNext ? pathname : undefined));
  }

  const session = await readSessionFromRuntime(request);
  if (!session || !session.authenticated) {
    if (isPublic) {
      const response = NextResponse.next();
      clearSessionCookie(response);
      return response;
    }

    const response = NextResponse.redirect(buildLoginRedirect(request));
    clearSessionCookie(response);
    return response;
  }

  if (isLogin) {
    if (session.user.obrigarTrocaSenha) {
      return NextResponse.redirect(new URL("/trocar-senha", request.url));
    }

    return NextResponse.redirect(new URL("/", request.url));
  }

  if (session.user.obrigarTrocaSenha) {
    if (!isTrocarSenha) {
      return NextResponse.redirect(new URL("/trocar-senha", request.url));
    }

    return NextResponse.next();
  }

  if (isTrocarSenha) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!canAccessPath(session.user.perfil, pathname)) {
    if (pathname !== "/acesso-negado") {
      return NextResponse.redirect(new URL("/acesso-negado", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
