import Link from "next/link";
import { redirect } from "next/navigation";

import { ListingEditor } from "@/components/listing-editor";
import { getAdminSession } from "@/lib/admin-auth";
import { getVenueEditorData } from "@/lib/venue-repository";

export default async function ManagerListingEditorPage({
  params
}: {
  params: Promise<{ venueId: string }>;
}) {
  const session = await getAdminSession();

  if (!session) {
    redirect("/manager/login");
  }

  const { venueId } = await params;
  const venue = await getVenueEditorData(venueId);

  if (!venue) {
    redirect("/manager");
  }

  if (
    session.role !== "superadmin" &&
    (session.role === "admin"
      ? venue.companyId !== session.companyId
      : venue.ownerManagerId !== session.managerId)
  ) {
    redirect("/manager");
  }

  return (
    <main className="page-shell page-shell-immersive manager-listing-page">
      <div className="manager-listing-topbar">
        <Link className="m-btn manager-listing-back" href="/manager">
          Назад в панель
        </Link>
      </div>
      <ListingEditor initialVenue={venue} mode={session.role === "superadmin" ? "full" : "basic"} />
    </main>
  );
}
