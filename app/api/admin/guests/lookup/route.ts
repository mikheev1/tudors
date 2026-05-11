import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-auth";
import { getGuestProfile } from "@/lib/guest-profile";

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Требуется вход" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone") || "";

  if (!phone) {
    return NextResponse.json({ ok: false, message: "phone обязателен" }, { status: 400 });
  }

  try {
    const profile = await getGuestProfile({
      phone,
      companyId: session.companyId,
      managerId: session.managerId,
      role: session.role,
    });

    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    console.error("Guest lookup failed", error);
    return NextResponse.json({ ok: false, message: "Не удалось найти гостя" }, { status: 500 });
  }
}
