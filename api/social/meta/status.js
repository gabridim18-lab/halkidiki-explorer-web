"use strict";

const { requireStudioUser } = require("../../_lib/auth");
const { connectionForUser, getMetaConfig, safeStatus } = require("../../_lib/meta");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }
  try {
    const user = await requireStudioUser(request);
    const config = getMetaConfig({ allowMissing: true });
    if (!config.configured) {
      return response.status(200).json({ configured: false, facebook: { connected: false, state: "error", name: "", message: "Meta account setup is not configured." }, instagram: { connected: false, state: "error", username: "", message: "Meta account setup is not configured." } });
    }
    return response.status(200).json(safeStatus(connectionForUser(request, config, user.id)));
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error("Social Studio Meta status error", { statusCode });
    return response.status(statusCode).json({ error: statusCode === 500 ? "The Studio could not read Meta account status." : error.message });
  }
};
