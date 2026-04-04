import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-auth";
import { getCompanyTheme, updateCompanyTheme } from "@/lib/company-config";

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ ok: false, message: "Нет доступа" }, { status: 403 });
  }

  const formData = await request.formData();
  const companyId = String(formData.get("companyId") || "");
  const file = formData.get("file");

  if (!companyId) {
    return NextResponse.json({ ok: false, message: "Не выбрана компания" }, { status: 400 });
  }

  const companyTheme = await getCompanyTheme(companyId);
  if (!companyTheme) {
    return NextResponse.json({ ok: false, message: "Компания не найдена" }, { status: 404 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Файл не получен" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const extension = path.extname(file.name) || ".png";
  const fileName = `${companyId}-${Date.now()}${extension}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");

  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, fileName), buffer);

  const logoImageUrl = `/uploads/${fileName}`;
  await updateCompanyTheme(companyId, (theme) => ({
    ...theme,
    logoImageUrl
  }));

  return NextResponse.json({ ok: true, logoImageUrl });
}
