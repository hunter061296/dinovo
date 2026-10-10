import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export const api = axios.create({ baseURL: API_BASE_URL });

const TOKEN_KEY = "dinovo_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 here always means the stored token is gone/invalid — bounce to login rather than
// letting every screen handle that case individually.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// The `{ error }` message an API failure carries, for showing in a form or modal.
export function apiErrorMessage(err: unknown, fallback: string): string | null {
  if (!err) return null;
  const message = (err as { response?: { data?: { error?: unknown } } }).response?.data?.error;
  return typeof message === "string" ? message : fallback;
}
