"use strict";

const { requireStudioUser } = require("../../_lib/auth");
const { authorizationUrl, getMetaConfig, startOAuthState } = require("../../_lib/meta");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }
  try {
    const user = await requireStudioUser(request);
    const config = getMetaConfig();
    const state = startOAuthState(response, config, user.id);
    return response.status(200).json({ authorizationUrl: authorizationUrl(config, state) });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error("Social Studio Meta connection error", { statusCode });
    return response.status(statusCode).json({ error: statusCode === 500 ? "The Studio could not start Meta account setup." : error.message });
  }
};
