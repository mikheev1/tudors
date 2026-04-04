import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminSession, setAdminSessionCookie } from "@/lib/admin-auth";
import { getManagerAccount } from "@/lib/company-config";

const loginSchema = z.object({
  username: z.string().min(1, "Введите логин"),
  password: z.string().min(1, "Введите пароль")
});

export async function POST(request: Request) {
  const body = await request.json();
  const result = loginSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        ok: false,
        message: result.error.issues[0]?.message || "Неверные данные"
      },
      { status: 400 }
    );
  }

  const manager = await getManagerAccount(result.data.username, result.data.password);
  if (!manager) {
    return NextResponse.json(
      {
        ok: false,
        message: "Неверный логин или пароль"
      },
      { status: 401 }
    );
  }

  const token = createAdminSession({
    managerId: manager.id,
    companyId: manager.companyId
  });

  await setAdminSessionCookie(token);

  return NextResponse.json({
    ok: true,
    redirectTo: "/manager"
  });
}
