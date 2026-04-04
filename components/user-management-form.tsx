"use client";

import { FormEvent, useState, useTransition } from "react";

import type { ManagerAccount } from "@/lib/types";

type UserManagementFormProps = {
  users: ManagerAccount[];
  companyId: string;
  companyName: string;
};

const roleLabels: Record<Exclude<ManagerAccount["role"], "superadmin">, string> = {
  admin: "Администратор",
  manager: "Менеджер"
};

export function UserManagementForm({ users, companyId, companyName }: UserManagementFormProps) {
  const [items, setItems] = useState(users);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      setMessage("");

      const response = await fetch("/api/admin/company/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          companyId,
          fullName: String(formData.get("fullName") || ""),
          username: String(formData.get("username") || ""),
          password: String(formData.get("password") || ""),
          role: String(formData.get("role") || "manager")
        })
      });

      const payload = (await response.json()) as { message?: string; user?: ManagerAccount };

      if (!response.ok || !payload.user) {
        setMessage(payload.message || "Не удалось создать пользователя");
        return;
      }

      setItems((current) => [...current, payload.user!]);
      setMessage("Пользователь добавлен");
      event.currentTarget.reset();
    });
  }

  return (
    <section className="settings-form-shell">
      <div className="listing-editor-header">
        <div>
          <span className="card-label">Пользователи</span>
          <h2>{companyName}</h2>
          <p>Здесь добавляются сотрудники компании. Им можно менять только информацию объявлений и работать со своими заявками.</p>
        </div>
      </div>

      {message ? <div className="admin-login-hint">{message}</div> : null}

      <div className="listing-editor-grid">
        <div className="listing-editor-card">
          <span className="card-label">Текущие сотрудники</span>
          <div className="hotspot-editor-list">
            {items.map((user) => (
              <div className="manager-listing-card" key={user.id}>
                <strong>{user.fullName}</strong>
                <span className="result-vertical-chip">
                  {user.role === "superadmin" ? "Супер-админ" : roleLabels[user.role]}
                </span>
                <p>{user.username}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="listing-editor-card">
          <span className="card-label">Новый сотрудник</span>
          <form className="settings-field-grid" onSubmit={handleSubmit}>
            <label className="settings-field">
              <span>Имя</span>
              <input name="fullName" placeholder="Имя пользователя" required type="text" />
            </label>
            <label className="settings-field">
              <span>Логин</span>
              <input name="username" placeholder="Логин" required type="text" />
            </label>
            <label className="settings-field">
              <span>Пароль</span>
              <input name="password" placeholder="Пароль" required type="text" />
            </label>
            <label className="settings-field">
              <span>Роль</span>
            <select className="compact-select" defaultValue="manager" name="role">
              <option value="manager">Менеджер</option>
              <option value="admin">Администратор</option>
            </select>
            </label>
            <button className="primary-button wide-button" disabled={isPending} type="submit">
              {isPending ? "Добавление..." : "Добавить пользователя"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
