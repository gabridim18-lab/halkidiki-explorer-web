"use strict";

const fs = require("fs");
const path = require("path");

let loaded = false;

function parseLocalEnvironment(contents) {
  const values = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const name = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[name] = value;
  }

  return values;
}

/**
 * Vercel Dev normally injects Development variables. This linked project does
 * not currently do so, so local functions need a server-only fallback. It is
 * disabled in production and never overwrites injected environment variables.
 */
function loadLocalEnvironment() {
  if (loaded || process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return;
  }

  loaded = true;
  const filePath = path.join(process.cwd(), ".env.local");

  try {
    const values = parseLocalEnvironment(fs.readFileSync(filePath, "utf8"));

    Object.entries(values).forEach(([name, value]) => {
      if (process.env[name] === undefined) {
        process.env[name] = value;
      }
    });
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Social Studio could not read its local environment file.");
    }
  }
}

module.exports = { loadLocalEnvironment };
