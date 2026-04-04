"use client";

import { useState } from "react";

import { CompanySettingsForm } from "@/components/company-settings-form";
import { UserManagementForm } from "@/components/user-management-form";
import type { CompanyThemeConfig, ManagerAccount } from "@/lib/types";

type CompanyAdminWorkspaceProps = {
  theme: CompanyThemeConfig;
  users: ManagerAccount[];
};

export function CompanyAdminWorkspace({
  theme,
  users
}: CompanyAdminWorkspaceProps) {
  const [tab, setTab] = useState<"branding" | "users">("branding");

  return (
    <section className="superadmin-settings-detail">
      <div className="superadmin-settings-header">
        <div>
          <span className="card-label">Открытая компания</span>
          <h1>{theme.name}</h1>
          <p>Все настройки этой компании собраны здесь. Просто переключай вкладки, не уходя на другие страницы.</p>
        </div>

        <div className="superadmin-settings-tabs">
          <button
            className={`workspace-tab ${tab === "branding" ? "active" : ""}`}
            onClick={() => setTab("branding")}
            type="button"
          >
            Брендинг
          </button>
          <button
            className={`workspace-tab ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}
            type="button"
          >
            Пользователи
          </button>
        </div>
      </div>

      <div className="superadmin-settings-panel">
        {tab === "branding" ? (
          <CompanySettingsForm theme={theme} />
        ) : (
          <UserManagementForm companyId={theme.id} companyName={theme.name} users={users} />
        )}
      </div>
    </section>
  );
}
