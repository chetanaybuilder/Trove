/**
 * Keeping authentication in one fetch boundary prevents individual UI components
 * from accidentally forgetting the ownership token. A 401 invalidates the local
 * session because the backend is the authoritative source of session validity.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const raw = typeof window !== "undefined" ? localStorage.getItem("trove_session") : null;
  const session = raw ? JSON.parse(raw) : null;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", headers.get("Content-Type") || "application/json");
  if (session?.session_token) headers.set("Authorization", `Bearer ${session.session_token}`);

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("trove_session");
    location.href = "/";
  }
  return response;
}