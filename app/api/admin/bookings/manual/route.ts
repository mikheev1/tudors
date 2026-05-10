import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSession } from "@/lib/admin-auth";
import { createManualBooking } from "@/lib/operations";

const manualBookingSchema = z.object({
  venueId: z.string().min(1),
  hotspotLabel: z.string().min(1),
  tableId: z.string().min(1).optional(),
  roomName: z.string().min(1).optional(),
  name: z.string().min(2),
  phone: z.string().min(7),
  telegram: z.string().optional(),
  date: z.string().min(1),
  time: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), "Некорректное время"),
  guests: z.coerce.number().int().min(1).max(5000),
  note: z.string().optional(),
  status: z.enum(["NEW", "HOLD_PENDING", "CONFIRMED", "WAITLIST"]).optional()
});

export async function POST(request: Request) {
  const session = await getAdminSession();

  if (!session || session.role === "superadmin") {
    return NextResponse.json({ ok: false, message: "Нет доступа" }, { status: 403 });
  }

  const body = await request.json();
  const result = manualBookingSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ ok: false, message: "Некорректные данные брони" }, { status: 400 });
  }

  try {
    await createManualBooking(result.data, session.managerId);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Не удалось создать бронь"
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
