import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/auth-actions";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUser, SESSION_COOKIE_NAME } from "@/lib/auth-session";
import { getModulesForRole } from "@/lib/modules";
import {
  canAccessPath,
  canManageUsers,
  canViewResetRequests,
  getRoleLabel
} from "@/lib/rbac";

import "./globals.css";

export const metadata: Metadata = {
  title: "BPMA App",
  description: "Sistema para controle de boas práticas em manipulação de alimentos"
};

type RootLayoutProps = {
  children: React.ReactNode;
};

const themeInitScript = `
(() => {
  try {
    const theme = window.localStorage.getItem("bpma-theme");
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  } catch (_error) {}
})();
`;

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/acesso-negado"
  );
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const pathname = requestHeaders.get("x-pathname") ?? "/";
  const isLoginPath = pathname === "/login" || pathname.startsWith("/login/");
  const isTrocaSenhaPath = pathname.startsWith("/trocar-senha");
  const isPublic = isPublicPath(pathname);
  const hasSessionCookie = Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value?.trim());
  const user = await getCurrentUser();

  if (!user && !isPublic) {
    const url = new URL("/login", "http://localhost");
    if (pathname && pathname !== "/" && pathname !== "/trocar-senha") {
      url.searchParams.set("next", pathname);
    }
    if (hasSessionCookie) {
      url.searchParams.set("clearSession", "1");
    }

    redirect(`${url.pathname}?${url.searchParams.toString()}`);
  }

  if (user) {
    if (isLoginPath) {
      redirect(user.obrigarTrocaSenha ? "/trocar-senha" : "/");
    }

    if (user.obrigarTrocaSenha) {
      if (!isTrocaSenhaPath) {
        redirect("/trocar-senha");
      }
    } else if (isTrocaSenhaPath) {
      redirect("/");
    }

    if (!canAccessPath(user.perfil, pathname)) {
      redirect("/acesso-negado");
    }
  }

  const modules = user ? getModulesForRole(user.perfil) : [];

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-[var(--app-bg)] text-[var(--app-text)]">
        {!user ? (
          <main className="mx-auto min-h-screen w-full max-w-md p-4 md:p-8">{children}</main>
        ) : (
          <div className="min-h-screen md:flex">
            <Sidebar
              modules={modules}
              userName={user.nomeCompleto}
              userRoleLabel={getRoleLabel(user.perfil)}
              canManageUsers={canManageUsers(user.perfil)}
              canViewResetRequests={canViewResetRequests(user.perfil)}
              onLogout={logoutAction}
            />
            <main className="flex-1 p-4 md:p-8">
              <div className="mx-auto w-full max-w-7xl">{children}</div>
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
