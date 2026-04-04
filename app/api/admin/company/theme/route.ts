import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSession } from "@/lib/admin-auth";
import { getCompanyTheme, updateCompanyTheme } from "@/lib/company-config";

const themeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  logoText: z.string().min(1),
  logoImageUrl: z.string().optional().default(""),
  accent: z.string().min(1),
  accentDark: z.string().min(1),
  surfaceTint: z.string().min(1),
  panelSurface: z.string().min(1),
  dashboardBackgroundUrl: z.string().optional().default(""),
  telegramBotName: z.string().optional().default(""),
  telegramAdminChatId: z.string().optional().default(""),
  managerReminderLeadMinutes: z.coerce.number().int().min(1).max(1440).optional().default(60),
  customerReminderLeadMinutes: z.coerce.number().int().min(1).max(1440).optional().default(30)
});

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ ok: false, message: "Нет доступа" }, { status: 403 });
  }

  const body = await request.json();
  const result = themeSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ ok: false, message: "Некорректные данные" }, { status: 400 });
  }

  const companyTheme = await getCompanyTheme(result.data.id);
  if (!companyTheme) {
    return NextResponse.json({ ok: false, message: "Компания не найдена" }, { status: 404 });
  }

  await updateCompanyTheme(result.data.id, () => result.data);

  return NextResponse.json({ ok: true });
}
