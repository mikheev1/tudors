import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSession } from "@/lib/admin-auth";
import {
  createManagerAccount,
  getCompanyTheme,
  getManagerAccounts
} from "@/lib/company-config";

const userSchema = z.object({
  companyId: z.string().min(1),
  fullName: z.string().min(2),
  username: z.string().min(3),
  password: z.string().min(3),
  role: z.enum(["admin", "manager"])
});

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ ok: false, message: "Нет доступа" }, { status: 403 });
  }

  const body = await request.json();
  const result = userSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ ok: false, message: "Некорректные данные" }, { status: 400 });
  }

  const companyTheme = await getCompanyTheme(result.data.companyId);
  if (!companyTheme) {
    return NextResponse.json({ ok: false, message: "Компания не найдена" }, { status: 404 });
  }

  const existing = await getManagerAccounts();
  if (existing.some((item) => item.username === result.data.username)) {
    return NextResponse.json({ ok: false, message: "Логин уже занят" }, { status: 409 });
  }

  const user = await createManagerAccount({
    id: `mgr-${Date.now()}`,
    companyId: result.data.companyId,
    fullName: result.data.fullName,
    username: result.data.username,
    password: result.data.password,
    role: result.data.role
  });

  return NextResponse.json({ ok: true, user });
}
