"use strict";

const { loadLocalEnvironment } = require("./local-env");

loadLocalEnvironment();

function authorizationToken(request) {
  const header = request.headers?.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : "";
}

function configuredAdminIds() {
  return new Set(
    (process.env.SOCIAL_STUDIO_ADMIN_USER_IDS || "")
      .split(",")
      .map(id => id.trim())
      .filter(Boolean)
  );
}

function authError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function supabaseAuthConfig() {
  const supabaseUrl = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
  const missing = [];

  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!publishableKey) missing.push("SUPABASE_PUBLISHABLE_KEY");

  if (missing.length) {
    // This deliberately logs names only: never credentials, tokens, or users.
    console.error(
      `Social Studio auth configuration is missing: ${missing.join(", ")}. ` +
      "Restart vercel dev after updating .env.local."
    );
    throw authError("The Studio authentication service is not configured. Restart the local server after updating .env.local.", 503);
  }

  try {
    const parsedUrl = new URL(supabaseUrl);
    if (parsedUrl.pathname !== "/" || !/^https:$/i.test(parsedUrl.protocol)) {
      throw new Error("not a Supabase project origin");
    }
  } catch {
    console.error("Social Studio auth configuration has an invalid SUPABASE_URL origin.");
    throw authError("The Studio authentication service has an invalid Supabase URL configuration.", 503);
  }

  return { supabaseUrl, publishableKey };
}

async function verificationFailure(response) {
  const fallback = { code: "unknown", message: "" };

  try {
    const body = await response.clone().json();
    const code = typeof body?.code === "string" ? body.code.slice(0, 80) : fallback.code;
    const message = typeof body?.message === "string" ? body.message.slice(0, 160) : "";
    return { code, message };
  } catch {
    return fallback;
  }
}

/**
 * Validates the incoming Supabase access token with Supabase itself. Browser
 * checks are only for UX; this check is the authorization boundary.
 */
async function requireStudioUser(request) {
  const token = authorizationToken(request);

  if (!token) {
    throw authError("Sign in is required to use the Social Content Studio.", 401);
  }

  const { supabaseUrl, publishableKey } = supabaseAuthConfig();

  let response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    console.error("Supabase verification request failed", error);
    throw authError("Authentication verification is temporarily unavailable.", 503);
  }

  if (!response.ok) {
    const failure = await verificationFailure(response);

    // Safe diagnostic metadata only. It never includes bearer tokens, API keys,
    // or any returned user fields.
    console.warn("Supabase verification was rejected", {
      status: response.status,
      providerCode: failure.code,
      providerMessage: failure.message
    });

    if (/api key|apikey|publishable key/i.test(failure.message)) {
      throw authError("The Studio authentication service key is not accepted by Supabase.", 503);
    }

    if (response.status === 401 || response.status === 403) {
      throw authError("Your admin session is invalid or has expired. Please sign in again.", 401);
    }

    throw authError("Authentication verification is temporarily unavailable.", 503);
  }

  const user = await response.json();
  const allowedIds = configuredAdminIds();
  const roleAllowsStudio = user?.app_metadata?.social_content_studio === true;

  // Default-deny is deliberate: a valid account is not automatically a Studio
  // administrator. App metadata is controlled by Supabase, unlike user metadata.
  if (!roleAllowsStudio && !allowedIds.has(user?.id)) {
    throw authError("This account is not authorized to use the Social Content Studio.", 403);
  }

  return user;
}

module.exports = { requireStudioUser };
