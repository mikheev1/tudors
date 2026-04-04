import { NextResponse } from "next/server";

import { getVenueAvailabilitySlots } from "@/lib/availability";
import { getPublicVenues } from "@/lib/venue-repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId");
  const date = searchParams.get("date");
  const hotspotLabel = searchParams.get("hotspotLabel") || undefined;
  const hotspotStatus = searchParams.get("hotspotStatus") || undefined;
  const hotspotKind = searchParams.get("hotspotKind") || undefined;

  if (!venueId || !date) {
    return NextResponse.json(
      {
        ok: false,
        message: "venueId и date обязательны."
      },
      { status: 400 }
    );
  }

  const venues = await getPublicVenues();
  const venue = venues.find((item) => item.id === venueId);

  if (!venue) {
    return NextResponse.json(
      {
        ok: false,
        message: "Объект не найден."
      },
      { status: 404 }
    );
  }

  const slots = await getVenueAvailabilitySlots({
    venue,
    date,
    hotspotLabel,
    hotspotStatus,
    hotspotKind
  });

  return NextResponse.json({
    ok: true,
    data: slots
  });
}
