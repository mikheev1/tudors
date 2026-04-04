import { NextResponse } from "next/server";

import { createRealBooking } from "@/lib/manager-bookings";
import { buildBookingFeedback } from "@/lib/processes";
import { bookingRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const body = await request.json();
  const result = bookingRequestSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "Заявка не прошла валидацию.",
        issues: result.error.issues.map((issue) => issue.message)
      },
      { status: 400 }
    );
  }

  const selectedSpot = result.data.comment?.split("|")[0]?.trim() || "выбранному месту";
  const feedback = buildBookingFeedback(
    result.data.venue,
    selectedSpot,
    result.data.date,
    result.data.time
  );

  try {
    await createRealBooking(result.data);
  } catch (error) {
    console.error("Failed to create booking request", error);

    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Не удалось сохранить заявку в базе."
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      ...feedback
    },
    { status: 201 }
  );
}
