import { CONVEX_URL } from "./config.js";
import { getAccessToken, refreshSession } from "./authSession.js";

/**
 * Minimal Convex HTTP client for vanilla ESM (no bundler).
 * @param {"query" | "mutation" | "action"} kind
 * @param {string} path
 * @param {Record<string, unknown>} [args]
 * @param {{ retryOnAuth?: boolean }} [options]
 */
async function callConvex(kind, path, args = {}, options = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${CONVEX_URL}/api/${kind}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      path,
      args: [args],
      format: "json",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Convex ${kind} failed (${response.status})`);
  }

  const payload = await response.json();
  if (payload.status === "error") {
    const message = payload.errorMessage || `Convex ${kind} error`;
    const canRetry =
      options.retryOnAuth !== false &&
      token &&
      /auth|unauth|token|identity/i.test(message);
    if (canRetry) {
      const refreshed = await refreshSession();
      if (refreshed) {
        return callConvex(kind, path, args, { retryOnAuth: false });
      }
    }
    throw new Error(message);
  }
  return payload.value;
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} [args]
 */
export function convexQuery(path, args = {}) {
  return callConvex("query", path, args);
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} [args]
 */
export function convexMutation(path, args = {}) {
  return callConvex("mutation", path, args);
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} [args]
 */
export function convexAction(path, args = {}) {
  return callConvex("action", path, args);
}
