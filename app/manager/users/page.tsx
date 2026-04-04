import { redirect } from "next/navigation";

export default async function ManagerUsersPage({
  searchParams
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const { companyId } = await searchParams;
  redirect(`/manager/settings${companyId ? `?companyId=${companyId}` : ""}`);
}
