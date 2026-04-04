import Link from "next/link";

import { ManagerLoginForm } from "@/components/manager-login-form";
import { TudorsStudioLogo } from "@/components/tudors-studio-logo";

export default function ManagerLoginPage() {
  return (
    <main className="page-shell page-shell-immersive">
      <div className="manager-login-shell golobe-login-shell">
        <div className="manager-login-card golobe-login-card">
          <div className="golobe-login-form-side">
            <div className="manager-login-brand golobe-login-brand">
              <TudorsStudioLogo variant="compact" />
              <div>
                <strong>Tudors Studio</strong>
                <p>Панель управления объектами, бронированиями и уведомлениями</p>
              </div>
            </div>
            <ManagerLoginForm />
            <Link className="manager-login-back" href="/">
              Назад к витрине
            </Link>
          </div>
          <div className="golobe-login-visual">
            <div className="golobe-login-image" />
            <div className="golobe-login-dots">
              <span className="active" />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
