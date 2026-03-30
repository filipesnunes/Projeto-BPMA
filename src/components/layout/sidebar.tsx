"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AppModule } from "@/lib/modules";

type SidebarProps = {
  modules: AppModule[];
  userName: string;
  userRoleLabel: string;
  canManageUsers: boolean;
  canViewResetRequests: boolean;
  onLogout: () => Promise<void>;
};

export function Sidebar({
  modules,
  userName,
  userRoleLabel,
  canManageUsers,
  canViewResetRequests,
  onLogout
}: SidebarProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  const navItems = modules.map((module) => {
    const isActive = pathname === module.href;

    return (
      <li key={module.href}>
        <Link
          href={module.href}
          className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          {module.name}
        </Link>
      </li>
    );
  });

  const userManagementNavItem = canManageUsers ? (
    <li>
      <Link
        href="/usuarios"
        className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
          pathname.startsWith("/usuarios") && !pathname.startsWith("/usuarios/solicitacoes")
            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            : "text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        Gestão de Usuários
      </Link>
    </li>
  ) : null;

  const resetRequestsNavItem = canViewResetRequests ? (
    <li>
      <Link
        href="/usuarios/solicitacoes"
        className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
          pathname.startsWith("/usuarios/solicitacoes")
            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
            : "text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        Solicitações de Senha
      </Link>
    </li>
  ) : null;

  return (
    <>
      <aside className="w-full shrink-0 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 md:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link href="/" className="block truncate text-base font-bold text-slate-900 dark:text-slate-100">
              BPMA App
            </Link>
            <p className="truncate text-xs text-slate-500 dark:text-slate-300">
              {userName} • {userRoleLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-3 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            aria-expanded={mobileMenuOpen}
            aria-controls="bpma-mobile-sidebar-drawer"
          >
            {mobileMenuOpen ? "Fechar" : "Menu"}
          </button>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50"
            aria-label="Fechar menu lateral"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside
            id="bpma-mobile-sidebar-drawer"
            className="absolute inset-y-0 left-0 w-[86%] max-w-xs overflow-y-auto border-r border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="p-4">
              <Link href="/" className="block text-lg font-bold text-slate-900 dark:text-slate-100">
                BPMA App
              </Link>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                Boas práticas em manipulação de alimentos
              </p>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{userName}</p>
                <p className="text-slate-600 dark:text-slate-300">{userRoleLabel}</p>
              </div>
            </div>

            <nav className="px-3 pb-6">
              <ul className="space-y-1">
                {navItems}
                {userManagementNavItem}
                {resetRequestsNavItem}
              </ul>
              <form action={onLogout} className="mt-4">
                <button type="submit" className="btn-secondary w-full">
                  Sair
                </button>
              </form>
            </nav>
          </aside>
        </div>
      ) : null}

      <aside className="hidden w-80 shrink-0 border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 md:min-h-screen md:block">
        <div className="p-6">
          <Link href="/" className="block text-xl font-bold text-slate-900 dark:text-slate-100">
            BPMA App
          </Link>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
            Boas práticas em manipulação de alimentos
          </p>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
            <p className="font-semibold text-slate-800 dark:text-slate-100">{userName}</p>
            <p className="text-slate-600 dark:text-slate-300">{userRoleLabel}</p>
          </div>
        </div>

        <nav className="px-3 pb-6">
          <ul className="space-y-1">
            {navItems}
            {userManagementNavItem}
            {resetRequestsNavItem}
          </ul>
          <form action={onLogout} className="mt-4">
            <button type="submit" className="btn-secondary w-full">
              Sair
            </button>
          </form>
        </nav>
      </aside>
    </>
  );
}
