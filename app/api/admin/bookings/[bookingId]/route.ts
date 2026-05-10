import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSession } from "@/lib/admin-auth";
import { assignBookingTime, updateRealBookingStatus } from "@/lib/manager-bookings";

const patchSchema = z.union([
  z.object({
    action: z.enum(["confirm", "decline", "hold", "waitlist", "cancel", "archive", "restore", "arrived", "complete_visit"])
  }),
  z.object({
    action: z.literal("assign_time"),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Некорректный формат времени (ожидается HH:MM)")
  })
]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ bookingId: string }> }
) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json(
      { ok: false, message: "Требуется вход в админку" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const result = patchSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { ok: false, message: "Некорректное действие" },
      { status: 400 }
    );
  }

  const { bookingId } = await context.params;

  try {
    if (result.data.action === "assign_time") {
      await assignBookingTime({
        bookingId,
        managerId: session.managerId,
        time: result.data.time,
        role: session.role
      });
    } else {
      await updateRealBookingStatus({
        bookingId,
        managerId: session.managerId,
        action: result.data.action,
        role: session.role
      });
    }
  } catch (error) {
    console.error("Failed to update booking", error);
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Не удалось обновить заявку"
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
