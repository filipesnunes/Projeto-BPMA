import type { Metadata } from "next";

import { logoutAction } from "@/app/auth-actions";
import { Sidebar } from "@/components/layout/sidebar";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-branding";
import { getCurrentUser } from "@/lib/auth-session";
import { getModulesForUser } from "@/lib/modules";
import { hasPermission } from "@/lib/permissions";
import { getRoleLabel } from "@/lib/rbac";
import { getAppAppearance } from "@/lib/visual-personalization";
import { appearanceCss } from "@/lib/appearance-settings";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-600.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/open-sans/latin-400.css";
import "@fontsource/open-sans/latin-600.css";
import "@fontsource/open-sans/latin-700.css";

import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  applicationName: APP_NAME,
  description: APP_DESCRIPTION
};

type RootLayoutProps = {
  children: React.ReactNode;
};

const themeInitScript = (institutional: string) => `
(() => {
  const syncTheme = () => {
  try {
    let theme = null;
    try { theme = window.localStorage.getItem("bpma-theme"); } catch (_storageError) {}
    const institutional = document.documentElement.dataset.institutionalTheme || ${JSON.stringify(institutional)};
    if (theme === "dark" || (theme !== "light" && (institutional === "ESCURO" || (institutional === "AUTOMATICO" && window.matchMedia('(prefers-color-scheme: dark)').matches)))) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  } catch (_error) {}
  };
  syncTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
})();
`;

export default async function RootLayout({ children }: RootLayoutProps) {
  const user = await getCurrentUser();
  const appearance = await getAppAppearance();

  const modules = user ? getModulesForUser(user) : [];

  return (
    <html lang="pt-BR" data-institutional-theme={appearance.temaPadrao} suppressHydrationWarning>
      <head>
        <style>{appearanceCss(appearance)}</style>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript(appearance.temaPadrao) }} />
      </head>
      <body className="bg-[var(--background-page)] text-[var(--text-default)]">
        {!user ? (
          <main className="mx-auto min-h-screen w-full max-w-md p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-8">
            {children}
          </main>
        ) : (
          <div className="min-h-screen 2xl:flex">
            <Sidebar
              institutionalTheme={appearance.temaPadrao}
              modules={modules}
              userName={user.nomeCompleto}
              userRoleLabel={user.perfilNome ?? getRoleLabel(user.perfil)}
              canManageUsers={hasPermission(user, "usuarios.acessar")}
              canViewResetRequests={hasPermission(user, "usuarios.redefinir_senha")}
              onLogout={logoutAction}
            />
            <main className="flex-1 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-8">
              <div className="mx-auto w-full max-w-7xl">{children}</div>
            </main>
          </div>
        )}
      </body>
    </html>
  );
}
