import { NextResponse } from "next/server";

import { getAdminSession } from "@/lib/admin-auth";
import { getVenueEditorData, updateVenueEditorData } from "@/lib/venue-repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ venueId: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Требуется вход" }, { status: 401 });
  }

  const { venueId } = await context.params;
  const venue = await getVenueEditorData(venueId);

  if (!venue) {
    return NextResponse.json({ ok: false, message: "Объект не найден" }, { status: 404 });
  }

  if (
    session.role !== "superadmin" &&
    (session.role === "admin"
      ? venue.companyId !== session.companyId
      : venue.ownerManagerId !== session.managerId)
  ) {
    return NextResponse.json({ ok: false, message: "Нет доступа" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, data: venue });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ venueId: string }> }
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Требуется вход" }, { status: 401 });
  }

  const { venueId } = await context.params;
  const currentVenue = await getVenueEditorData(venueId);

  if (!currentVenue) {
    return NextResponse.json({ ok: false, message: "Объект не найден" }, { status: 404 });
  }

  if (
    session.role !== "superadmin" &&
    (session.role === "admin"
      ? currentVenue.companyId !== session.companyId
      : currentVenue.ownerManagerId !== session.managerId)
  ) {
    return NextResponse.json({ ok: false, message: "Нет доступа" }, { status: 403 });
  }

  const body = await request.json();
  const nextPayload =
    session.role === "superadmin"
      ? {
          ...currentVenue,
          ...body
        }
      : {
          ...currentVenue,
          name: body.name ?? currentVenue.name,
          city: body.city ?? currentVenue.city,
          type: body.type ?? currentVenue.type,
          price: body.price ?? currentVenue.price,
          summary: body.summary ?? currentVenue.summary,
          bookingSlots: body.bookingSlots ?? currentVenue.bookingSlots
        };

  await updateVenueEditorData({
    ...nextPayload,
    id: currentVenue.id,
    companyId: currentVenue.companyId,
    ownerManagerId: currentVenue.ownerManagerId
  });

  return NextResponse.json({ ok: true });
}
