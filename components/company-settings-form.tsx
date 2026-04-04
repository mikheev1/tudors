"use client";

import Image from "next/image";
import { FormEvent, useState, useTransition } from "react";

import type { CompanyThemeConfig } from "@/lib/types";

type CompanySettingsFormProps = {
  theme: CompanyThemeConfig;
};

export function CompanySettingsForm({ theme }: CompanySettingsFormProps) {
  const [form, setForm] = useState(theme);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      setMessage("");

      const response = await fetch("/api/admin/company/theme", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      const payload = (await response.json()) as { message?: string };
      setMessage(response.ok ? "Брендинг сохранен" : payload.message || "Не удалось сохранить");
    });
  }

  async function handleLogoUpload(file?: File | null) {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("companyId", form.id);
    formData.append("file", file);

    const response = await fetch("/api/admin/company/logo", {
      method: "POST",
      body: formData
    });

    const payload = (await response.json()) as { message?: string; logoImageUrl?: string };

    if (!response.ok || !payload.logoImageUrl) {
      setMessage(payload.message || "Не удалось загрузить логотип");
      return;
    }

    setForm((current) => ({
      ...current,
      logoImageUrl: payload.logoImageUrl
    }));
    setMessage("Логотип загружен, не забудь сохранить бренд");
  }

  return (
    <form className="settings-form-shell" onSubmit={handleSave}>
      <div className="listing-editor-header">
        <div>
          <span className="card-label">Брендинг</span>
          <h2>{form.name}</h2>
          <p>Здесь настраиваются визуал кабинета, фон, bot-подпись и канал уведомлений компании.</p>
        </div>
        <button className="primary-button" disabled={isPending} type="submit">
          {isPending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>

      {message ? <div className="admin-login-hint">{message}</div> : null}

      <div className="listing-editor-grid">
        <div className="listing-editor-card">
          <span className="card-label">Основное</span>
          <div className="settings-field-grid">
            <label className="settings-field">
              <span>Название компании</span>
              <input
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                value={form.name}
              />
            </label>
            <label className="settings-field">
              <span>Короткий знак</span>
              <input
                maxLength={4}
                onChange={(event) =>
                  setForm((current) => ({ ...current, logoText: event.target.value.toUpperCase() }))
                }
                value={form.logoText}
              />
            </label>
          </div>

          <div className="settings-color-grid">
            <label className="settings-field">
              <span>Основной цвет</span>
              <input
                onChange={(event) =>
                  setForm((current) => ({ ...current, accent: event.target.value }))
                }
                value={form.accent}
              />
            </label>
            <label className="settings-field">
              <span>Темный акцент</span>
              <input
                onChange={(event) =>
                  setForm((current) => ({ ...current, accentDark: event.target.value }))
                }
                value={form.accentDark}
              />
            </label>
            <label className="settings-field">
              <span>Фон интерфейса</span>
              <input
                onChange={(event) =>
                  setForm((current) => ({ ...current, surfaceTint: event.target.value }))
                }
                value={form.surfaceTint}
              />
            </label>
            <label className="settings-field">
              <span>Панели</span>
              <input
                onChange={(event) =>
                  setForm((current) => ({ ...current, panelSurface: event.target.value }))
                }
                value={form.panelSurface}
              />
            </label>
            <label className="settings-field">
              <span>Фон кабинета</span>
              <input
                onChange={(event) =>
                  setForm((current) => ({ ...current, dashboardBackgroundUrl: event.target.value }))
                }
                placeholder="URL подложки"
                value={form.dashboardBackgroundUrl || ""}
              />
            </label>
          </div>
        </div>

        <div className="listing-editor-card">
          <span className="card-label">Логотип</span>
          <div className="brand-upload-preview">
            {form.logoImageUrl ? (
              <Image alt={form.name} className="brand-upload-image" height={72} src={form.logoImageUrl} width={72} />
            ) : (
              <span className="brand-badge">{form.logoText}</span>
            )}
            <div>
              <strong>{form.name}</strong>
              <p>PNG / JPG / SVG</p>
            </div>
          </div>
          <div
            className="brand-color-preview"
            style={{
              background: `linear-gradient(135deg, ${form.accentDark}, ${form.accent})`
            }}
          />
          <label className="toolbar-button brand-upload-button">
            Загрузить логотип
            <input
              hidden
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={(event) => handleLogoUpload(event.target.files?.[0])}
              type="file"
            />
          </label>
        </div>

        <div className="listing-editor-card listing-editor-card-wide">
          <span className="card-label">Bot и уведомления</span>
          <div className="settings-field-grid">
            <label className="settings-field">
              <span>Имя bot-подписи</span>
              <input
                onChange={(event) =>
                  setForm((current) => ({ ...current, telegramBotName: event.target.value }))
                }
                placeholder="Tudors Concierge"
                value={form.telegramBotName || ""}
              />
            </label>
            <label className="settings-field">
              <span>Admin chat id</span>
              <input
                onChange={(event) =>
                  setForm((current) => ({ ...current, telegramAdminChatId: event.target.value }))
                }
                placeholder="-1001234567890"
                value={form.telegramAdminChatId || ""}
              />
            </label>
            <label className="settings-field">
              <span>Напоминание менеджеру, мин.</span>
              <input
                min={1}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    managerReminderLeadMinutes: Number(event.target.value || 60)
                  }))
                }
                type="number"
                value={form.managerReminderLeadMinutes || 60}
              />
            </label>
            <label className="settings-field">
              <span>Напоминание клиенту, мин.</span>
              <input
                min={1}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    customerReminderLeadMinutes: Number(event.target.value || 30)
                  }))
                }
                type="number"
                value={form.customerReminderLeadMinutes || 30}
              />
            </label>
          </div>
        </div>
      </div>
    </form>
  );
}
