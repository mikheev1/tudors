import { notFound } from "next/navigation";

import { TourExplorer } from "@/components/tour-explorer";
import { fetchPublicVenuesFromBackend } from "@/lib/api/public-backend";
import { getCompanyThemes } from "@/lib/company-config";
import type { VenueSearchFilters, VenueVertical } from "@/lib/types";

const allowedVerticals: VenueVertical[] = [
  "restaurant",
  "apartment",
  "event-space",
  "office",
  "villa"
];

export default async function CategoryPage({
  params
}: {
  params: Promise<{ vertical: string }>;
}) {
  const { vertical } = await params;

  if (!allowedVerticals.includes(vertical as VenueVertical)) {
    notFound();
  }

  const filters: VenueSearchFilters = {
    q: "",
    vertical: vertical as VenueVertical,
    type: "all",
    availability: "all",
    time: "all"
  };
  const venues = await fetchPublicVenuesFromBackend(filters);
  const companyThemes = await getCompanyThemes();

  return (
    <main className="page-shell page-shell-immersive">
      <TourExplorer
        companyTheme={companyThemes[0]}
        initialFilters={filters}
        initialVertical={vertical as VenueVertical}
        mode="category"
        venues={venues}
      />
    </main>
  );
}
