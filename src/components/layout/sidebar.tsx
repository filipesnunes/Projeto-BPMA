"use client";

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

  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 md:min-h-screen md:w-80 md:border-b-0 md:border-r">
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
          {modules.map((module) => {
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
          })}
          {canManageUsers ? (
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
          ) : null}
          {canViewResetRequests ? (
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
          ) : null}
        </ul>
        <form action={onLogout} className="mt-4">
          <button type="submit" className="btn-secondary w-full">
            Sair
          </button>
        </form>
      </nav>
    </aside>
  );
}
