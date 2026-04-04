"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { CompanyThemeConfig } from "@/lib/types";

type CompanySwitcherProps = {
  companies: CompanyThemeConfig[];
  activeCompanyId: string;
  basePath: string;
  className?: string;
  subtitle?: string;
  pageSize?: number;
};

export function CompanySwitcher({
  companies,
  activeCompanyId,
  basePath,
  className = "",
  subtitle,
  pageSize = 5
}: CompanySwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeIndex = Math.max(
    companies.findIndex((company) => company.id === activeCompanyId),
    0
  );
  const totalPages = Math.max(1, Math.ceil(companies.length / pageSize));
  const [page, setPage] = useState(Math.floor(activeIndex / pageSize) + 1);

  useEffect(() => {
    setPage(Math.floor(activeIndex / pageSize) + 1);
  }, [activeIndex, pageSize]);

  const pagedCompanies = useMemo(() => {
    const start = (page - 1) * pageSize;
    return companies.slice(start, start + pageSize);
  }, [companies, page, pageSize]);

  function handleSelect(companyId: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("companyId", companyId);
    router.push(`${basePath}?${nextParams.toString()}`);
  }

  return (
    <section className={`company-switcher-shell ${className}`.trim()}>
      <div className="company-switcher-head">
        <div>
          <span className="card-label">Клиенты</span>
          <h2>Список компаний</h2>
          <p>{subtitle || "Выбери компанию из списка и меняй все настройки ниже в этом же окне."}</p>
        </div>

        <div className="company-switcher-pagination">
          <button
            className="toolbar-button"
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            type="button"
          >
            Назад
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            className="toolbar-button"
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            type="button"
          >
            Дальше
          </button>
        </div>
      </div>

      <div className="company-switcher-list">
        {pagedCompanies.map((company) => {
          const isActive = company.id === activeCompanyId;

          return (
            <div className={`company-switcher-row ${isActive ? "active" : ""}`} key={company.id}>
              <div className="company-switcher-brand">
                {company.logoImageUrl ? (
                  <Image
                    alt={company.name}
                    className="brand-upload-image"
                    height={52}
                    src={company.logoImageUrl}
                    width={52}
                  />
                ) : (
                  <span
                    className="brand-badge"
                    style={{
                      background: `linear-gradient(135deg, ${company.accentDark}, ${company.accent})`
                    }}
                  >
                    {company.logoText}
                  </span>
                )}

                <div>
                  <strong>{company.name}</strong>
                  <p>{company.id}</p>
                </div>
              </div>

              <button
                className={isActive ? "secondary-button" : "primary-button subtle-button"}
                onClick={() => handleSelect(company.id)}
                type="button"
              >
                {isActive ? "Выбрана" : "Выбрать"}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
