import { TourExplorer } from "@/components/tour-explorer";
import { getCompanyThemes } from "@/lib/company-config";
import { fetchPublicVenuesFromBackend } from "@/lib/api/public-backend";
import type { VenueSearchFilters } from "@/lib/types";

export default async function HomePage() {
  const companyThemes = await getCompanyThemes();
  const filters: VenueSearchFilters = {
    q: "",
    vertical: "all",
    type: "all",
    availability: "all",
    time: "all"
  };
  const venues = await fetchPublicVenuesFromBackend(filters);

  return (
    <TourExplorer companyTheme={companyThemes[0]} initialFilters={filters} venues={venues} />
  );
}
