import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-auth";
import { findOverlappingBooking } from "@/lib/booking-conflict";
import { prisma } from "@/lib/prisma";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Требуется вход" }, { status: 401 });
  }
  if (!prisma) {
    return NextResponse.json({ ok: false, conflict: null });
  }

  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId") || "";
  const date = searchParams.get("date") || "";
  const time = searchParams.get("time") || "";
  const placeLabel = searchParams.get("placeLabel") || "";
  const tableId = searchParams.get("tableId") || undefined;
  const roomName = searchParams.get("roomName") || undefined;
  const excludeBookingId = searchParams.get("excludeBookingId") || undefined;

  if (!venueId || !date || !time || !placeLabel) {
    return NextResponse.json({ ok: false, message: "venueId, date, time, placeLabel обязательны" }, { status: 400 });
  }
  if (!TIME_RE.test(time)) {
    return NextResponse.json({ ok: false, message: "Некорректное время" }, { status: 400 });
  }

  try {
    const db = prisma as any;
    const conflict = await findOverlappingBooking(db, {
      venueId,
      date,
      time,
      placeLabel,
      tableId,
      roomName,
      excludeBookingId,
    });

    return NextResponse.json({
      ok: true,
      conflict: conflict
        ? {
            bookingId: conflict.bookingId,
            customerName: conflict.customerName,
            placeLabel: conflict.placeLabel,
            windowLabel: conflict.windowLabel,
          }
        : null,
    });
  } catch (error) {
    console.error("Conflict check failed", error);
    return NextResponse.json({ ok: false, message: "Не удалось проверить конфликт" }, { status: 500 });
  }
}
