import { convexAction, convexMutation, convexQuery } from "./convexClient.js";
import {
  clearSession,
  getAccessToken,
  loadTokens,
  saveTokens,
} from "./authSession.js";

/**
 * @typedef {{ _id: string, email: string | null, name: string | null }} AuthUser
 */

/**
 * @param {"signIn" | "signUp"} flow
 * @param {string} email
 * @param {string} password
 */
export async function passwordAuth(flow, email, password) {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !password) {
    throw new Error("Email and password are required");
  }
  if (flow === "signUp" && password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  // Avoid sending a stale bearer token during credential auth.
  clearSession();

  const result = await convexAction("auth:signIn", {
    provider: "password",
    params: {
      email: trimmedEmail,
      password,
      flow,
    },
  });

  if (!result?.tokens?.token || !result?.tokens?.refreshToken) {
    throw new Error("Sign-in failed — no tokens returned");
  }

  saveTokens({
    token: result.tokens.token,
    refreshToken: result.tokens.refreshToken,
  });

  await convexMutation("library:getOrCreate", {});
  return await getCurrentUser();
}

export async function signOut() {
  try {
    if (getAccessToken()) {
      await convexAction("auth:signOut", {});
    }
  } catch {
    // still clear local session
  } finally {
    clearSession();
  }
}

/** @returns {Promise<AuthUser | null>} */
export async function getCurrentUser() {
  if (!loadTokens()) return null;
  try {
    return await convexQuery("library:me", {});
  } catch {
    return null;
  }
}

export function isSignedInLocally() {
  return Boolean(loadTokens());
}
