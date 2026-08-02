import { AUTH_STORAGE_KEY, CONVEX_URL } from "./config.js";

/**
 * @typedef {{ token: string, refreshToken: string }} AuthTokens
 */

/** @returns {AuthTokens | null} */
export function loadTokens() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.token !== "string" ||
      typeof parsed.refreshToken !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** @param {AuthTokens | null} tokens */
export function saveTokens(tokens) {
  try {
    if (!tokens) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return;
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // ignore
  }
}

/** @returns {string | null} */
export function getAccessToken() {
  return loadTokens()?.token ?? null;
}

export function clearSession() {
  saveTokens(null);
}

/**
 * Exchange refresh token for a new access token.
 * @returns {Promise<boolean>}
 */
export async function refreshSession() {
  const current = loadTokens();
  if (!current?.refreshToken) return false;

  try {
    const response = await fetch(`${CONVEX_URL}/api/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "auth:signIn",
        args: [{ refreshToken: current.refreshToken }],
        format: "json",
      }),
    });
    if (!response.ok) {
      clearSession();
      return false;
    }
    const payload = await response.json();
    if (payload.status === "error" || !payload.value?.tokens?.token) {
      clearSession();
      return false;
    }
    saveTokens({
      token: payload.value.tokens.token,
      refreshToken:
        payload.value.tokens.refreshToken ?? current.refreshToken,
    });
    return true;
  } catch {
    clearSession();
    return false;
  }
}
