import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        authenticated: false
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        id: user.id,
        perfil: user.perfil,
        obrigarTrocaSenha: user.obrigarTrocaSenha
      }
    },
    { status: 200 }
  );
}

