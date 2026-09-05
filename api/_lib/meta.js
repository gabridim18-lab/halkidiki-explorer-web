"use strict";

const crypto = require("crypto");
const { loadLocalEnvironment } = require("./local-env");

loadLocalEnvironment();

const STATE_COOKIE = "he_meta_oauth_state";
const CONNECTION_COOKIE = "he_meta_connection";
const STATE_TTL_SECONDS = 10 * 60;
const CONNECTION_TTL_SECONDS = 60 * 24 * 60 * 60;
const META_PERMISSIONS = Object.freeze([
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish"
]);

function metaError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requiredValue(name, values, missing) {
  const value = (process.env[name] || "").trim();
  if (!value) missing.push(name);
  values[name] = value;
}

function getMetaConfig({ allowMissing = false } = {}) {
  const values = {};
  const missing = [];
  ["META_APP_ID", "META_APP_SECRET", "META_REDIRECT_URI", "META_OAUTH_STATE_SECRET", "META_SESSION_ENCRYPTION_KEY", "META_GRAPH_API_VERSION"]
    .forEach(name => requiredValue(name, values, missing));

  if (missing.length) {
    if (allowMissing) return { configured: false, missing };
    throw metaError("Meta account connection is not configured. Ask an administrator to add the required server environment variables.");
  }

  let redirectUri;
  try {
    redirectUri = new URL(values.META_REDIRECT_URI);
    if (!/^https?:$/.test(redirectUri.protocol) || redirectUri.pathname !== "/api/social/meta/callback" || redirectUri.search || redirectUri.hash) {
      throw new Error("invalid redirect URI");
    }
  } catch {
    throw metaError("The Meta redirect URI is not configured as a valid callback URL.");
  }

  if (!/^v\d+\.\d+$/.test(values.META_GRAPH_API_VERSION)) {
    throw metaError("The Meta Graph API version is not configured correctly.");
  }

  const encryptionKey = Buffer.from(values.META_SESSION_ENCRYPTION_KEY, "base64");
  if (encryptionKey.length !== 32) {
    throw metaError("The Meta session encryption key is not configured correctly.");
  }

  return {
    configured: true,
    appId: values.META_APP_ID,
    appSecret: values.META_APP_SECRET,
    redirectUri: redirectUri.toString(),
    origin: redirectUri.origin,
    stateSecret: values.META_OAUTH_STATE_SECRET,
    encryptionKey,
    graphVersion: values.META_GRAPH_API_VERSION
  };
}

function parseCookies(request) {
  const source = request.headers?.cookie || "";
  return Object.fromEntries(source.split(";").map(item => {
    const index = item.indexOf("=");
    if (index < 1) return [];
    return [item.slice(0, index).trim(), item.slice(index + 1).trim()];
  }).filter(pair => pair.length));
}

function appendCookie(response, cookie) {
  const current = response.getHeader?.("Set-Cookie");
  const values = current ? (Array.isArray(current) ? current : [current]) : [];
  response.setHeader("Set-Cookie", [...values, cookie]);
}

function cookie(name, value, maxAge, secure) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

function cookieIsSecure(config) {
  return new URL(config.redirectUri).protocol === "https:";
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function equal(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function encodeSigned(value, secret) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function decodeSigned(value, secret) {
  if (typeof value !== "string") return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra || !equal(sign(payload, secret), signature)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function startOAuthState(response, config, userId) {
  const state = crypto.randomBytes(32).toString("base64url");
  const payload = { state, userId, expiresAt: Date.now() + STATE_TTL_SECONDS * 1000 };
  appendCookie(response, cookie(STATE_COOKIE, encodeSigned(payload, config.stateSecret), STATE_TTL_SECONDS, cookieIsSecure(config)));
  return state;
}

function verifyOAuthState(request, response, config, receivedState) {
  const stored = decodeSigned(parseCookies(request)[STATE_COOKIE], config.stateSecret);
  appendCookie(response, cookie(STATE_COOKIE, "", 0, cookieIsSecure(config)));
  if (!stored || typeof receivedState !== "string" || !equal(stored.state, receivedState) || stored.expiresAt < Date.now() || typeof stored.userId !== "string") {
    throw metaError("The Meta connection request could not be verified. Please start again from the Studio.", 400);
  }
  return stored.userId;
}

function sealConnection(connection, config) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", config.encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(connection), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function openConnection(value, config) {
  if (typeof value !== "string") return null;
  try {
    const packed = Buffer.from(value, "base64url");
    if (packed.length < 29) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", config.encryptionKey, packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8"));
  } catch {
    return null;
  }
}

function saveConnection(response, config, connection) {
  appendCookie(response, cookie(CONNECTION_COOKIE, sealConnection(connection, config), CONNECTION_TTL_SECONDS, cookieIsSecure(config)));
}

function connectionForUser(request, config, userId) {
  const connection = openConnection(parseCookies(request)[CONNECTION_COOKIE], config);
  if (!connection || connection.userId !== userId) return null;
  return connection;
}

function safeStatus(connection) {
  const expired = connection?.expiresAt && connection.expiresAt <= Date.now();
  if (!connection || expired) {
    const message = expired ? "Meta authorization has expired. Reconnect your accounts." : "Not connected";
    return {
      configured: true,
      facebook: { connected: false, state: expired ? "error" : "not_connected", name: "", message },
      instagram: { connected: false, state: expired ? "error" : "not_connected", username: "", message }
    };
  }

  return {
    configured: true,
    facebook: connection.facebook?.pageId
      ? { connected: true, state: "connected", name: connection.facebook.name || "Connected Page", message: "Connected" }
      : { connected: false, state: connection.facebook?.state || "error", name: "", message: connection.facebook?.message || "No Facebook Page was found." },
    instagram: connection.instagram?.accountId
      ? { connected: true, state: "connected", username: connection.instagram.username || "Connected professional account", message: "Connected" }
      : { connected: false, state: connection.instagram?.state || "not_connected", username: "", message: connection.instagram?.message || "No linked Instagram professional account was found." }
  };
}

function authorizationUrl(config, state) {
  const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_PERMISSIONS.join(","));
  return url.toString();
}

async function readMetaJson(url, label) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    console.warn("Meta request unavailable", { label });
    throw metaError("Meta account setup is temporarily unavailable. Please try again.");
  }
  let body = {};
  try { body = await response.json(); } catch { /* handled below */ }
  if (!response.ok || body?.error) {
    // Only safe diagnostic metadata: no URL, code, access token, or account data.
    console.warn("Meta request rejected", { label, status: response.status, errorType: body?.error?.type || "unknown", errorCode: body?.error?.code || "unknown" });
    throw metaError("Meta could not complete account setup. Please try again.");
  }
  return body;
}

async function exchangeCode(config, code) {
  const endpoint = new URL("https://graph.facebook.com/oauth/access_token");
  endpoint.searchParams.set("client_id", config.appId);
  endpoint.searchParams.set("client_secret", config.appSecret);
  endpoint.searchParams.set("redirect_uri", config.redirectUri);
  endpoint.searchParams.set("code", code);
  const initial = await readMetaJson(endpoint, "code_exchange");
  if (typeof initial.access_token !== "string") throw metaError("Meta could not complete account setup. Please try again.");

  const longLivedEndpoint = new URL("https://graph.facebook.com/oauth/access_token");
  longLivedEndpoint.searchParams.set("grant_type", "fb_exchange_token");
  longLivedEndpoint.searchParams.set("client_id", config.appId);
  longLivedEndpoint.searchParams.set("client_secret", config.appSecret);
  longLivedEndpoint.searchParams.set("fb_exchange_token", initial.access_token);
  const longLived = await readMetaJson(longLivedEndpoint, "long_lived_token_exchange");
  if (typeof longLived.access_token !== "string") throw metaError("Meta could not complete account setup. Please try again.");
  return { accessToken: longLived.access_token, expiresIn: Number(longLived.expires_in) || 0 };
}

async function discoverAccounts(config, userId, accessToken, expiresIn) {
  const endpoint = new URL(`https://graph.facebook.com/${config.graphVersion}/me/accounts`);
  endpoint.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
  endpoint.searchParams.set("limit", "100");
  endpoint.searchParams.set("access_token", accessToken);
  const body = await readMetaJson(endpoint, "page_discovery");
  const pages = Array.isArray(body.data) ? body.data.filter(page => typeof page?.id === "string" && typeof page?.access_token === "string") : [];
  const expiresAt = expiresIn > 0 ? Date.now() + expiresIn * 1000 : Date.now() + CONNECTION_TTL_SECONDS * 1000;

  if (!pages.length) return { userId, expiresAt, facebook: { state: "error", message: "No authorized Facebook Page was found." }, instagram: { state: "not_connected", message: "No linked Instagram professional account was found." } };
  if (pages.length > 1) return { userId, expiresAt, facebook: { state: "error", message: "More than one Facebook Page was found. Page selection will be added before publishing is enabled." }, instagram: { state: "not_connected", message: "Instagram setup needs a selected Facebook Page." } };

  const page = pages[0];
  const instagram = page.instagram_business_account;
  return {
    userId,
    expiresAt,
    facebook: { pageId: page.id, name: String(page.name || "Connected Page").slice(0, 120), pageAccessToken: page.access_token },
    instagram: typeof instagram?.id === "string"
      ? { accountId: instagram.id, username: String(instagram.username || "").replace(/^@/, "").slice(0, 120), pageId: page.id }
      : { state: "not_connected", message: "No linked Instagram professional account was found." }
  };
}

function studioRedirect(config, result) {
  const url = new URL("/social-content-studio.html", config.origin);
  url.searchParams.set("meta", result);
  return url.toString();
}

module.exports = { META_PERMISSIONS, authorizationUrl, connectionForUser, discoverAccounts, exchangeCode, getMetaConfig, metaError, safeStatus, saveConnection, startOAuthState, studioRedirect, verifyOAuthState };
