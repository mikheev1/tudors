import type { Venue, VenueSearchFilters } from "@/lib/types";
import { getPublicVenues } from "@/lib/venue-repository";

const backendBaseUrl =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://localhost:4000";

export function buildBackendUrl(path: string) {
  return `${backendBaseUrl}${path}`;
}

export async function fetchPublicVenuesFromBackend(filters: VenueSearchFilters): Promise<Venue[]> {
  const params = new URLSearchParams();

  if (filters.q.trim()) {
    params.set("q", filters.q.trim());
  }

  if (filters.vertical !== "all") {
    params.set("vertical", filters.vertical);
  }

  if (filters.type !== "all") {
    params.set("type", filters.type);
  }

  if (filters.availability !== "all") {
    params.set("availability", filters.availability);
  }

  if (filters.time !== "all") {
    params.set("time", filters.time);
  }

  const query = params.toString();
  try {
    const response = await fetch(buildBackendUrl(`/api/venues${query ? `?${query}` : ""}`), {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Failed to load venues from backend");
    }

    const payload = (await response.json()) as { ok?: boolean; items?: Venue[] };
    return payload.items || [];
  } catch (error) {
    console.warn("Backend is unavailable, using local venue fallback.", error);
    return getPublicVenues();
  }
}
