export default function Loading() {
  return (
    <main className="loading-shell" aria-label="Загрузка Tudors Studio">
      <div className="loading-mark-shell" aria-hidden="true">
        <svg className="loading-mark" viewBox="0 0 96 112">
          <path
            className="loading-stroke loading-crown"
            d="M48 8 54 20 68 18 64 31 76 38 64 44 67 58 54 54 48 66 42 54 29 58 32 44 20 38 32 31 28 18 42 20Z"
          />
          <path
            className="loading-stroke loading-rose"
            d="M48 30c12 0 24 10 24 25 0 17-12 27-24 40-12-13-24-23-24-40 0-15 12-25 24-25Z"
          />
          <path
            className="loading-stroke loading-stem"
            d="M48 71v28"
          />
          <path
            className="loading-stroke loading-leaves"
            d="M48 88c-7-8-13-10-19-9 5 2 9 7 10 14M48 84c7-8 13-10 19-9-5 2-9 7-10 14"
          />
          <path
            className="loading-stroke loading-face"
            d="M37 52c2-7 7-12 11-12s9 5 11 12c-2 2-5 5-11 5s-9-3-11-5Z"
          />
          <path
            className="loading-stroke loading-face"
            d="M44 49h8M48 49v10"
          />
        </svg>
      </div>
    </main>
  );
}
