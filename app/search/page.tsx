import { TourExplorer } from "@/components/tour-explorer";
import { fetchPublicVenuesFromBackend } from "@/lib/api/public-backend";
import { getCompanyThemes } from "@/lib/company-config";
import { sanitizeVenueSearchFilters } from "@/lib/server/venue-search";

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = sanitizeVenueSearchFilters(params);
  const venues = await fetchPublicVenuesFromBackend(filters);
  const companyThemes = await getCompanyThemes();

  return (
    <main className="page-shell page-shell-immersive">
      <TourExplorer companyTheme={companyThemes[0]} initialFilters={filters} mode="search" venues={venues} />
    </main>
  );
}
