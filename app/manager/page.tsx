import { redirect } from "next/navigation";

import { ManagerDashboard } from "@/components/manager-dashboard";
import { getAdminSession } from "@/lib/admin-auth";
import { getCompanyTheme, getCompanyThemes } from "@/lib/company-config";
import { listManagerListings, listRealManagerBookings } from "@/lib/manager-bookings";
import { listManagerReminders, listManagerWaitlist } from "@/lib/operations";
import { getPublicVenues } from "@/lib/venue-repository";

export default async function ManagerPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/manager/login");
  }

  const [companyTheme, companyThemes] = await Promise.all([
    session.role === "superadmin" ? null : getCompanyTheme(session.companyId),
    getCompanyThemes()
  ]);
  const listings = await listManagerListings({
    companyId: session.companyId,
    managerId: session.managerId,
    role: session.role
  });
  const operationalVenues =
    session.role === "superadmin"
      ? []
      : (await getPublicVenues()).filter((venue) =>
          session.role === "admin"
            ? venue.companyId === session.companyId
            : venue.ownerManagerId === session.managerId
        );
  const scopedListings =
    session.role === "superadmin" ? listings : listings.slice(0, 1);
  const scopedVenueId = scopedListings[0]?.id;
  const bookings =
    session.role === "superadmin"
      ? []
      : await listRealManagerBookings({
          companyId: session.companyId,
          managerId: session.managerId,
          role: session.role
        });
  const [waitlistEntries, reminders] =
    session.role === "superadmin"
      ? [[], []]
      : await Promise.all([
          listManagerWaitlist({
            companyId: session.companyId,
            managerId: session.managerId,
            role: session.role,
            includeHistory: true
          }),
          listManagerReminders({
            companyId: session.companyId,
            role: session.role
          })
        ]);
  const scopedReminders =
    session.role === "superadmin" || !scopedListings[0]
      ? reminders
      : reminders.filter((item) => item.venueName === scopedListings[0].name);
  const scopedBookings =
    session.role === "superadmin" || !scopedListings[0]
      ? bookings
      : bookings.filter((booking) => booking.venueName === scopedListings[0].name);
  const scopedWaitlistEntries =
    session.role === "superadmin" || !scopedVenueId
      ? waitlistEntries
      : waitlistEntries.filter((entry) => entry.venueId === scopedVenueId);
  const scopedOperationalVenues =
    session.role === "superadmin" || !scopedVenueId
      ? []
      : operationalVenues.filter((venue) => venue.id === scopedVenueId).slice(0, 1);

  if (session.role !== "superadmin" && !companyTheme) {
    redirect("/manager/login");
  }

  return (
    <>
      <ManagerDashboard
        bookings={scopedBookings}
        companies={companyThemes}
        companyTheme={
          companyTheme || {
            id: "platform",
            name: "Tudors Studio",
            logoText: "TS",
            accent: "#a10f37",
            accentDark: "#18284a",
            surfaceTint: "rgba(251, 246, 247, 0.96)",
            panelSurface: "rgba(255, 255, 255, 0.98)"
          }
        }
        listings={scopedListings}
        managerName={session.fullName}
        operationalVenues={scopedOperationalVenues}
        reminders={scopedReminders}
        role={session.role}
        waitlistEntries={scopedWaitlistEntries}
      />
    </>
  );
}
