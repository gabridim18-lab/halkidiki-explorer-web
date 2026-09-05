"use strict";

const { discoverAccounts, exchangeCode, getMetaConfig, saveConnection, studioRedirect, verifyOAuthState } = require("../../_lib/meta");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).send("Method not allowed.");
  }

  let config;
  try {
    config = getMetaConfig();
    const state = typeof request.query?.state === "string" ? request.query.state : "";
    const userId = verifyOAuthState(request, response, config, state);
    if (request.query?.error) {
      return response.redirect(302, studioRedirect(config, "cancelled"));
    }
    const code = typeof request.query?.code === "string" ? request.query.code : "";
    if (!code) return response.redirect(302, studioRedirect(config, "error"));
    const token = await exchangeCode(config, code);
    saveConnection(response, config, await discoverAccounts(config, userId, token.accessToken, token.expiresIn));
    return response.redirect(302, studioRedirect(config, "connected"));
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error("Social Studio Meta callback error", { statusCode });
    if (config) return response.redirect(302, studioRedirect(config, statusCode === 400 ? "invalid_state" : "error"));
    return response.status(statusCode).send("Meta account setup could not be completed.");
  }
};
