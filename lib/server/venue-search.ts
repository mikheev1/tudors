import type { Venue, VenueAvailability, VenueSearchFilters, VenueVertical } from "@/lib/types";
import { getPublicVenues } from "@/lib/venue-repository";

const allowedVerticals = new Set<VenueVertical>([
  "restaurant",
  "apartment",
  "event-space",
  "office",
  "villa"
]);

const allowedAvailability = new Set<VenueAvailability>(["available", "limited", "busy"]);

function getSingleValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export function sanitizeVenueSearchFilters(
  input: Record<string, string | string[] | undefined>,
  defaults?: Partial<VenueSearchFilters>
): VenueSearchFilters {
  const q = getSingleValue(input.q).trim();
  const verticalValue = getSingleValue(input.vertical);
  const availabilityValue = getSingleValue(input.availability);

  return {
    q,
    vertical: allowedVerticals.has(verticalValue as VenueVertical)
      ? (verticalValue as VenueVertical)
      : defaults?.vertical || "all",
    type: getSingleValue(input.type).trim() || defaults?.type || "all",
    availability: allowedAvailability.has(availabilityValue as VenueAvailability)
      ? (availabilityValue as VenueAvailability)
      : defaults?.availability || "all",
    time: getSingleValue(input.time).trim() || defaults?.time || "all"
  };
}

export function filterVenuesBySearch(venues: Venue[], filters: VenueSearchFilters) {
  const normalizedQuery = filters.q.toLowerCase();

  return venues.filter((item) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.city.toLowerCase().includes(normalizedQuery) ||
      item.type.toLowerCase().includes(normalizedQuery);
    const matchesVertical = filters.vertical === "all" || item.vertical === filters.vertical;
    const matchesType = filters.type === "all" || item.type === filters.type;
    const matchesAvailability =
      filters.availability === "all" || item.availability === filters.availability;
    const matchesTime = filters.time === "all" || item.timeTags.includes(filters.time);

    return (
      matchesQuery &&
      matchesVertical &&
      matchesType &&
      matchesAvailability &&
      matchesTime
    );
  });
}

export async function getVenueSearchResults(filters: VenueSearchFilters) {
  const venues = await getPublicVenues();
  return filterVenuesBySearch(venues, filters);
}
