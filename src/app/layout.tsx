import type { Metadata } from "next";

import { Sidebar } from "@/components/layout/sidebar";

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

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-[var(--app-bg)] text-[var(--app-text)]">
        <div className="min-h-screen md:flex">
          <Sidebar />
          <main className="flex-1 p-4 md:p-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
