"use client";

import { FormEvent, useState, useTransition } from "react";

import { buildClientApiUrl } from "@/lib/client/api";
import type { Venue } from "@/lib/types";

const phoneCountryCodes = ["+998", "+7", "+996", "+994", "+90"];

function formatPhoneLocal(value: string) {
  return value.replace(/\D/g, "").slice(0, 9);
}

function buildPhoneNumber(countryCode: string, phoneLocal: string) {
  return `${countryCode} ${formatPhoneLocal(phoneLocal)}`.trim();
}

type BookingFormProps = {
  venues: Venue[];
  initialVenueName: string;
};

type ApiResponse = {
  ok: boolean;
  message: string;
  data?: unknown;
  issues?: string[];
};

export function BookingForm({ venues, initialVenueName }: BookingFormProps) {
  const [selectedVenue, setSelectedVenue] = useState(initialVenueName);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const countryCode = String(formData.get("countryCode") || "+998");
    const phoneLocal = String(formData.get("phoneLocal") || "");

    startTransition(async () => {
      const response = await fetch(buildClientApiUrl("/api/booking-requests"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...Object.fromEntries(formData.entries()),
          phone: buildPhoneNumber(countryCode, phoneLocal),
          telegram: String(formData.get("telegram") || "").trim(),
          guests: Number(formData.get("guests"))
        })
      });

      const payload = (await response.json()) as ApiResponse;
      setResult(payload);

      if (response.ok) {
        form.reset();
        setSelectedVenue(initialVenueName);
      }
    });
  }

  return (
    <div className="booking-layout">
      <form className="booking-form" onSubmit={handleSubmit}>
        <label>
          Имя
          <input name="name" type="text" placeholder="Ваше имя" required />
        </label>
        <label>
          Телефон
          <div className="phone-field-row">
            <select className="compact-select phone-country-select" defaultValue="+998" name="countryCode">
              {phoneCountryCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
            <input
              inputMode="numeric"
              maxLength={9}
              name="phoneLocal"
              onInput={(event) => {
                event.currentTarget.value = formatPhoneLocal(event.currentTarget.value);
              }}
              pattern="[0-9]{7,9}"
              placeholder="Номер телефона"
              required
              type="tel"
            />
          </div>
        </label>
        <label>
          Telegram
          <input name="telegram" type="text" placeholder="@username (опционально)" />
        </label>
        <label>
          Дата мероприятия
          <input name="date" type="date" required />
        </label>
        <label>
          Количество гостей
          <input name="guests" type="number" min="1" max="5000" required />
        </label>
        <label>
          Площадка
          <select
            name="venue"
            value={selectedVenue}
            onChange={(event) => setSelectedVenue(event.target.value)}
            required
          >
            {venues.map((venue) => (
              <option key={venue.id} value={venue.name}>
                {venue.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Комментарий
          <textarea
            name="comment"
            rows={4}
            placeholder="Свадьба, конференция, фотосессия, корпоратив..."
          />
        </label>
        <button className="primary-button wide-button" disabled={isPending} type="submit">
          {isPending ? "Отправка..." : "Отправить заявку"}
        </button>
      </form>

      <div className="booking-preview">
        <p className="card-label">Что должно быть в боевой версии</p>
        <ul>
          <li>Календарь занятости по слотам и часовым поясам.</li>
          <li>Онлайн-оплата и предоплата через платежный шлюз.</li>
          <li>CRM-панель для менеджеров и владельцев площадок.</li>
          <li>Загрузка новых 360-туров из админки без разработчика.</li>
        </ul>

        <div className={`form-result ${result?.ok ? "success" : ""}`}>
          {result ? (
            <>
              <strong>{result.message}</strong>
              {result.issues?.length ? (
                <ul>
                  {result.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            "После отправки здесь появится ответ API и будет понятно, принята ли заявка."
          )}
        </div>
      </div>
    </div>
  );
}
