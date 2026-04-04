import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-auth";
import { processNotificationQueue } from "@/lib/operations";

export async function POST() {
  const session = await getAdminSession();

  if (!session || session.role === "superadmin") {
    return NextResponse.json({ ok: false, message: "Нет доступа" }, { status: 403 });
  }

  try {
    const processed = await processNotificationQueue(session.companyId);
    return NextResponse.json({ ok: true, processed });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Не удалось обработать уведомления"
      },
      { status: 500 }
    );
  }
}
