import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminSession } from "@/lib/admin-auth";
import { offerWaitlistEntry, resolveWaitlistEntry } from "@/lib/operations";

const actionSchema = z.object({
  action: z.enum(["offer", "no-response", "responded"])
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ entryId: string }> }
) {
  const session = await getAdminSession();

  if (!session || session.role === "superadmin") {
    return NextResponse.json({ ok: false, message: "Нет доступа" }, { status: 403 });
  }

  const body = await request.json();
  const result = actionSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ ok: false, message: "Некорректное действие" }, { status: 400 });
  }

  const { entryId } = await context.params;

  try {
    if (result.data.action === "offer") {
      await offerWaitlistEntry(entryId, session.managerId);
    } else if (result.data.action === "responded") {
      await resolveWaitlistEntry(entryId, session.managerId, "responded");
    } else {
      await resolveWaitlistEntry(entryId, session.managerId, "no-response");
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Не удалось обработать waitlist"
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
