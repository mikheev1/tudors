export function buildClientApiUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
  return `${baseUrl}${path}`;
}
