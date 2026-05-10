import { redirect } from "next/navigation";

import { HallView } from "@/components/hall-view";
import { getAdminSession } from "@/lib/admin-auth";
import { listRealManagerBookings } from "@/lib/manager-bookings";
import { listManagerWaitlist } from "@/lib/operations";
import { getPublicVenues } from "@/lib/venue-repository";

export default async function HallPage() {
  const session = await getAdminSession();

  if (!session || session.role === "superadmin") {
    redirect("/manager/login");
  }

  const [bookings, waitlistEntries, allVenues] = await Promise.all([
    listRealManagerBookings({
      companyId: session.companyId,
      managerId: session.managerId,
      role: session.role
    }),
    listManagerWaitlist({
      companyId: session.companyId,
      managerId: session.managerId,
      role: session.role
    }),
    getPublicVenues()
  ]);

  const venues = allVenues.filter((v) =>
    session.role === "admin"
      ? v.companyId === session.companyId
      : v.ownerManagerId === session.managerId
  );

  return (
    <HallView
      bookings={bookings}
      managerName={session.fullName}
      role={session.role}
      venues={venues}
      waitlistEntries={waitlistEntries}
    />
  );
}
