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
    <form className="admin-login-form" onSubmit={handleSubmit}>
      <div className="admin-login-head">
        <span className="card-label">Tudors Studio</span>
        <h1>Вход</h1>
        <p>Используйте логин и пароль вашей роли для доступа к рабочему кабинету.</p>
      </div>

      <div className="inline-form admin-login-fields">
        <input autoComplete="username" name="username" placeholder="Логин" required type="text" />
        <input
          autoComplete="current-password"
          name="password"
          placeholder="Пароль"
          required
          type="password"
        />
      </div>

      {error ? <div className="admin-login-error">{error}</div> : null}

      <button className="primary-button wide-button" disabled={isPending} type="submit">
        {isPending ? "Вход..." : "Войти"}
      </button>

      <div className="admin-login-hint">
        Demo: `superadmin / superadmin123`, `city.manager / demo123`
      </div>
    </form>
  );
}
