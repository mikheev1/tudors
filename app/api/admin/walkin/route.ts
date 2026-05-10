import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSession } from "@/lib/admin-auth";
import { createWalkinBooking } from "@/lib/operations";

const walkinSchema = z.object({
  venueId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tableLabel: z.string().min(1),
  tableId: z.string().min(1).optional(),
  roomName: z.string().min(1).optional(),
  upcomingBookingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Некорректный формат времени")
    .optional()
});

export async function POST(request: Request) {
  const session = await getAdminSession();

  if (!session || session.role === "superadmin") {
    return NextResponse.json({ ok: false, message: "Нет доступа" }, { status: 403 });
  }

  const body = await request.json();
  const result = walkinSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ ok: false, message: "Некорректные данные" }, { status: 400 });
  }

  try {
    const booking = await createWalkinBooking({
      venueId: result.data.venueId,
      date: result.data.date,
      tableLabel: result.data.tableLabel,
      tableId: result.data.tableId,
      roomName: result.data.roomName,
      managerId: session.managerId,
      upcomingBookingTime: result.data.upcomingBookingTime
    });
    return NextResponse.json({ ok: true, bookingId: booking.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Не удалось отметить стол" },
      { status: 500 }
    );
  }
}
