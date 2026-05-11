import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { suggestWalkinTables } from "@/lib/walkin-suggest";

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session || session.role === "superadmin") {
    return NextResponse.json({ ok: false, message: "Нет доступа" }, { status: 403 });
  }
  if (!prisma) {
    return NextResponse.json({ ok: false, suggestions: [] });
  }

  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId") || "";
  const guests = Number(searchParams.get("guests") || "0");
  const durationMinutes = Number(searchParams.get("durationMinutes") || "90");
  const preferredRoomId = searchParams.get("preferredRoomId") || undefined;

  if (!venueId || !guests) {
    return NextResponse.json({ ok: false, message: "venueId и guests обязательны" }, { status: 400 });
  }
  if (guests < 1 || guests > 50) {
    return NextResponse.json({ ok: false, message: "guests от 1 до 50" }, { status: 400 });
  }

  try {
    const suggestions = await suggestWalkinTables(prisma as any, {
      venueId,
      guests,
      durationMinutes: durationMinutes > 0 ? durationMinutes : undefined,
      preferredRoomId,
      limit: 6,
    });
    return NextResponse.json({ ok: true, suggestions });
  } catch (error) {
    console.error("Walk-in suggestion failed", error);
    return NextResponse.json({ ok: false, message: "Не удалось подобрать столы" }, { status: 500 });
  }
}
