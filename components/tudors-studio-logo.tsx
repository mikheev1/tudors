type TudorsStudioLogoProps = {
  variant?: "header" | "stacked" | "compact";
  className?: string;
};

export function TudorsStudioLogo({
  variant = "header",
  className = ""
}: TudorsStudioLogoProps) {
  if (variant === "compact") {
    return (
      <div className={`tudors-logo tudors-logo-compact ${className}`.trim()}>
        <svg
          aria-hidden="true"
          className="tudors-logo-mark"
          viewBox="0 0 96 112"
        >
          <path
            d="M48 8 54 20 68 18 64 31 76 38 64 44 67 58 54 54 48 66 42 54 29 58 32 44 20 38 32 31 28 18 42 20Z"
            fill="none"
            stroke="var(--brand-burgundy)"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M48 30c12 0 24 10 24 25 0 17-12 27-24 40-12-13-24-23-24-40 0-15 12-25 24-25Z"
            fill="none"
            stroke="var(--brand-burgundy)"
            strokeWidth="4"
          />
          <path
            d="M48 71v28"
            stroke="var(--brand-green)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M48 88c-7-8-13-10-19-9 5 2 9 7 10 14M48 84c7-8 13-10 19-9-5 2-9 7-10 14"
            fill="none"
            stroke="var(--brand-green)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M37 52c2-7 7-12 11-12s9 5 11 12c-2 2-5 5-11 5s-9-3-11-5Z"
            fill="none"
            stroke="var(--brand-navy)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M44 49h8M48 49v10"
            stroke="var(--brand-navy)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  return (
    <div className={`tudors-logo tudors-logo-${variant} ${className}`.trim()}>
      <svg
        aria-hidden="true"
        className="tudors-logo-mark"
        viewBox="0 0 96 112"
      >
        <path
          d="M48 8 54 20 68 18 64 31 76 38 64 44 67 58 54 54 48 66 42 54 29 58 32 44 20 38 32 31 28 18 42 20Z"
          fill="none"
          stroke="var(--brand-burgundy)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path
          d="M48 30c12 0 24 10 24 25 0 17-12 27-24 40-12-13-24-23-24-40 0-15 12-25 24-25Z"
          fill="none"
          stroke="var(--brand-burgundy)"
          strokeWidth="4"
        />
        <path
          d="M48 71v28"
          stroke="var(--brand-green)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M48 88c-7-8-13-10-19-9 5 2 9 7 10 14M48 84c7-8 13-10 19-9-5 2-9 7-10 14"
          fill="none"
          stroke="var(--brand-green)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M37 52c2-7 7-12 11-12s9 5 11 12c-2 2-5 5-11 5s-9-3-11-5Z"
          fill="none"
          stroke="var(--brand-navy)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M44 49h8M48 49v10"
          stroke="var(--brand-navy)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>

      <div className="tudors-logo-wordmark">
        <strong>TUDORS</strong>
        <span>STUDIO</span>
      </div>
    </div>
  );
}
