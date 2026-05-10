import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-auth";
import { migrateFloorPlan } from "@/lib/floor-plan";
import { prisma } from "@/lib/prisma";
import type { FloorPlanData } from "@/lib/types";

// Прямая проверка прав без полного getPublicVenues()
async function checkAccess(venueId: string) {
  const session = await getAdminSession();
  if (!session) return { error: "Требуется вход", status: 401 } as const;
  if (!prisma) return { error: "База данных недоступна", status: 503 } as const;

  const db = prisma as any;
  const row = await db.venue.findUnique({
    where: { id: venueId },
    select: { id: true, companyId: true, ownerManagerId: true, floorPlan: true },
  });

  if (!row) return { error: "Объект не найден", status: 404 } as const;

  if (
    session.role !== "superadmin" &&
    (session.role === "admin"
      ? row.companyId !== session.companyId
      : row.ownerManagerId !== session.managerId)
  ) {
    return { error: "Нет доступа", status: 403 } as const;
  }

  return { session, row, db } as const;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await context.params;
  const result = await checkAccess(venueId);

  if ("error" in result) {
    return NextResponse.json({ ok: false, message: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, data: result.row.floorPlan ?? null });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await context.params;
  const result = await checkAccess(venueId);

  if ("error" in result) {
    return NextResponse.json({ ok: false, message: result.error }, { status: result.status });
  }

  const body = (await request.json()) as FloorPlanData;
  const normalized = migrateFloorPlan(body);

  if (!Array.isArray(normalized.rooms)) {
    return NextResponse.json({ ok: false, message: "Некорректный формат floor plan" }, { status: 400 });
  }

  await result.db.venue.update({
    where: { id: venueId },
    data: { floorPlan: normalized as object },
  });

  return NextResponse.json({ ok: true });
}
