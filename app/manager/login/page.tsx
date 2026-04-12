import Link from "next/link";

import { ManagerLoginForm } from "@/components/manager-login-form";

export default function ManagerLoginPage() {
  return (
    <div className="m-login-shell">
      <div className="m-login-side">
        <div className="m-login-brand">
          <div className="m-login-mark">TS</div>
          <div>
            <span className="m-login-brand-name">Tudors Studio</span>
            <span className="m-login-brand-sub">Панель управления</span>
          </div>
        </div>

        <ManagerLoginForm />

        <Link className="m-login-back" href="/">
          К витрине
        </Link>
      </div>

      <div className="m-login-visual" aria-hidden="true">
        <div className="m-login-visual-text">
          TUDORS<br />STUDIO
        </div>
      </div>
    </div>
  );
}
