import type { VenueSearchFilters } from "@/lib/types";

export function buildSearchHref(filters: VenueSearchFilters) {
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
  return query ? `/search?${query}` : "/search";
}
