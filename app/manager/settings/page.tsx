import Link from "next/link";
import { redirect } from "next/navigation";

import { CompanyAdminWorkspace } from "@/components/company-admin-workspace";
import { CompanySwitcher } from "@/components/company-switcher";
import { getAdminSession } from "@/lib/admin-auth";
import { getCompanyTheme, getCompanyThemes, getManagerAccounts } from "@/lib/company-config";

export default async function ManagerSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const session = await getAdminSession();

  if (!session || session.role !== "superadmin") {
    redirect("/manager");
  }

  const { companyId } = await searchParams;
  const targetCompanyId = companyId || "city-table";
  const [companyTheme, companyThemes, users] = await Promise.all([
    getCompanyTheme(targetCompanyId),
    getCompanyThemes(),
    getManagerAccounts()
  ]);

  if (!companyTheme) {
    redirect("/manager");
  }

  return (
    <main className="page-shell page-shell-immersive">
      <div className="manager-page-topbar">
        <Link className="toolbar-button" href="/manager">
          Назад в панель
        </Link>
      </div>

      <section className="superadmin-settings-layout">
        <div className="superadmin-settings-sidebar">
          <CompanySwitcher
            activeCompanyId={targetCompanyId}
            basePath="/manager/settings"
            companies={companyThemes}
            subtitle="Выбирай компанию слева, а вся работа по ней будет открываться справа."
          />
        </div>

        <CompanyAdminWorkspace
          theme={companyTheme}
          users={users.filter((item) => item.companyId === targetCompanyId)}
        />
      </section>
    </main>
  );
}
