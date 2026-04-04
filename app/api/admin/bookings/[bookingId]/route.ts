import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSession } from "@/lib/admin-auth";
import { updateRealBookingStatus } from "@/lib/manager-bookings";

const actionSchema = z.object({
  action: z.enum(["confirm", "decline", "hold", "waitlist", "cancel", "archive", "restore"])
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ bookingId: string }> }
) {
  const session = await getAdminSession();

  if (!session) {
    return NextResponse.json(
      {
        ok: false,
        message: "Требуется вход в админку"
      },
      { status: 401 }
    );
  }

  const body = await request.json();
  const result = actionSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "Некорректное действие"
      },
      { status: 400 }
    );
  }

  const { bookingId } = await context.params;

  try {
    await updateRealBookingStatus({
      bookingId,
      managerId: session.managerId,
      action: result.data.action,
      role: session.role
    });
  } catch (error) {
    console.error("Failed to update booking status", error);

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Не удалось обновить статус заявки"
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true
  });
}
