import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-session";

type LoginLayoutProps = {
  children: React.ReactNode;
};

export default async function LoginLayout({ children }: LoginLayoutProps) {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  return children;
}
