"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function ManagerLoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setError("");

      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: String(formData.get("username") || ""),
          password: String(formData.get("password") || "")
        })
      });

      const payload = (await response.json()) as { ok?: boolean; message?: string; redirectTo?: string };

      if (!response.ok) {
        setError(payload.message || "Не удалось войти");
        return;
      }

      router.push(payload.redirectTo || "/manager");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="m-login-eyebrow">Рабочий кабинет</div>
      <h1 className="m-login-title">Вход</h1>
      <p className="m-login-desc">Используйте логин и пароль вашей роли для доступа к панели управления.</p>

      <div className="m-login-fields">
        <div className="m-field">
          <label className="m-field-label" htmlFor="login-username">Логин</label>
          <input
            autoComplete="username"
            className="m-input"
            id="login-username"
            name="username"
            placeholder="Введите логин"
            required
            type="text"
          />
        </div>
        <div className="m-field">
          <label className="m-field-label" htmlFor="login-password">Пароль</label>
          <input
            autoComplete="current-password"
            className="m-input"
            id="login-password"
            name="password"
            placeholder="Введите пароль"
            required
            type="password"
          />
        </div>
      </div>

      {error ? <div className="m-login-error">{error}</div> : null}

      <button
        className="m-btn m-btn-gold"
        disabled={isPending}
        style={{ width: "100%", justifyContent: "center", height: 46, fontSize: 11 }}
        type="submit"
      >
        {isPending ? "Выполняется вход..." : "Войти"}
      </button>

      <div className="m-login-hint">
        Demo: superadmin / superadmin123 · city.manager / demo123
      </div>
    </form>
  );
}
