import { NextResponse } from "next/server";
import { z } from "zod";

import { createWaitlistEntry } from "@/lib/operations";
import { buildWaitlistFeedback } from "@/lib/processes";

const waitlistSchema = z.object({
  venueId: z.string().min(1),
  venueName: z.string().min(1),
  sceneId: z.string().min(1),
  sceneTitle: z.string().min(1),
  hotspotId: z.string().optional(),
  hotspotLabel: z.string().optional(),
  name: z.string().min(2, "Введите имя"),
  phone: z.string().min(7, "Введите номер телефона"),
  date: z.string().optional(),
  time: z.string().optional(),
  telegram: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .refine((value) => !value || /^@?[a-zA-Z0-9_]{5,32}$/.test(value), "Введите корректный Telegram")
});

export async function POST(request: Request) {
  const body = await request.json();
  const result = waitlistSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      {
        ok: false,
        message: "Не удалось добавить в лист ожидания.",
        issues: result.error.issues.map((issue) => issue.message)
      },
      { status: 400 }
    );
  }

  const feedback = buildWaitlistFeedback(
    result.data.venueName,
    result.data.hotspotLabel || result.data.sceneTitle
  );

  await createWaitlistEntry(result.data);

  return NextResponse.json(
    {
      ok: true,
      ...feedback
    },
    { status: 201 }
  );
}
