import { NextResponse } from "next/server";

import { getPublicVenues } from "@/lib/venue-repository";

export async function GET() {
  const venues = await getPublicVenues();

  return NextResponse.json({
    ok: true,
    data: venues
  });
}
