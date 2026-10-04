/**
 * Tiny API client for the Django backend.
 *
 * - Sends `Authorization: Bearer <access>` on every call.
 * - On 401 it calls /api/auth/token/refresh/ ONCE (shared by parallel calls),
 *   stores the new access + rotated refresh token, and retries the request.
 * - If the refresh fails, tokens are cleared and listeners are told to log out.
 */

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const ACCESS_KEY = "iiitr.access";
const REFRESH_KEY = "iiitr.refresh";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, data: unknown) {
    super(readableError(data) || `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
}

/** DRF errors come as {"detail": "..."} or {"field": ["msg"]}. Flatten to one line. */
function readableError(data: unknown): string {
  if (!data) return "";
  if (typeof data === "string") {
    // Django debug pages are HTML: show their <title> instead of raw markup.
    if (data.trimStart().startsWith("<")) {
      const title = data.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
      return `Server error${title ? `: ${title}` : ""}. Check the backend terminal for details.`;
    }
    return data.slice(0, 300);
  }
  if (Array.isArray(data)) return data.map(readableError).join(" ");
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (obj.detail) return readableError(obj.detail);
    return Object.entries(obj)
      .map(([k, v]) => (k === "non_field_errors" ? readableError(v) : `${k}: ${readableError(v)}`))
      .join(" · ");
  }
  return String(data);
}

// ---------------------------------------------------------------- tokens
export const tokens = {
  get access() {
    return typeof window === "undefined" ? null : localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return typeof window === "undefined" ? null : localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh?: string) {
    localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

type Listener = () => void;
const logoutListeners = new Set<Listener>();
export function onForcedLogout(fn: Listener) {
  logoutListeners.add(fn);
  return () => {
    logoutListeners.delete(fn);
  };
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refresh = tokens.refresh;
  if (!refresh) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/token/refresh/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        tokens.set(data.access, data.refresh);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

// ---------------------------------------------------------------- request
type Body = Record<string, unknown> | FormData | undefined;

/** fetch() with the access token, plus one silent refresh-and-retry on 401. */
async function authedFetch(path: string, options: { method?: string; body?: Body; auth?: boolean } = {}) {
  const { method = "GET", body, auth = true } = options;

  const doFetch = () => {
    const headers: Record<string, string> = {};
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    if (body && !isForm) headers["Content-Type"] = "application/json";
    const access = tokens.access;
    if (auth && access) headers.Authorization = `Bearer ${access}`;
    return fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && auth && tokens.refresh) {
    const ok = await refreshTokens();
    if (ok) {
      res = await doFetch();
    } else {
      tokens.clear();
      logoutListeners.forEach((fn) => fn());
    }
  }
  return res;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: Body; auth?: boolean } = {},
): Promise<T> {
  const res = await authedFetch(path, options);
  if (res.status === 204 || res.status === 205) return undefined as T;
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

/** Download a file (e.g. an Excel sheet) from an authenticated endpoint. */
export async function downloadFile(path: string, fallbackName: string) {
  const res = await authedFetch(path);
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, text ? safeJson(text) : null);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const name = disposition.match(/filename="?([^";]+)"?/)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null | string[]>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v)) v.forEach((item) => sp.append(k, item));
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
