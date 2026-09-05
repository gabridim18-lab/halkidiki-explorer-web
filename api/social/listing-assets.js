"use strict";

const { requireStudioUser } = require("../_lib/auth");
const {
  CATEGORIES,
  canonicalFacts,
  collectListingImageAssets,
  fetchCanonicalListing,
  resolveLinkedBeachNames,
  resolveRestaurantDestination
} = require("../_lib/halkidiki-data");
const { buildCreativePack } = require("../_lib/creative-pack");

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseBody(request) {
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      throw requestError("Request body must be valid JSON.");
    }
  }

  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
    throw requestError("Request body must be a JSON object.");
  }

  return request.body;
}

function listingTitle(facts, listingId) {
  return facts.titleEn || facts.title || facts.name?.en || facts.name?.ro || facts.name?.el || listingId;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  try {
    await requireStudioUser(request);
    const body = parseBody(request);
    const { category, listingId } = body;

    if (!Object.hasOwn(CATEGORIES, category)) throw requestError("Unknown content category.");
    if (typeof listingId !== "string") throw requestError("A listing ID is required.");

    const canonical = await fetchCanonicalListing(category, listingId);
    const facts = canonicalFacts(canonical.record, canonical.indexItem, canonical.listingId);
    const title = listingTitle(facts, canonical.listingId);
    const images = collectListingImageAssets(
      canonical.record,
      canonical.config,
      canonical.listingId
    );
    const language = ["en", "ro", "el"].includes(body.language) ? body.language : "en";
    const promotionalLocation = category === "restaurant"
      ? await resolveRestaurantDestination(canonical.record, language)
      : "";
    const localBusinessContext = category === "local-business"
      ? { linkedBeachNames: await resolveLinkedBeachNames(canonical.record.beaches, language, 2) }
      : {};
    const creativePack = buildCreativePack({
      category,
      record: canonical.record,
      facts,
      language,
      images,
      promotionalLocation,
      localBusinessContext
    });

    return response.status(200).json({
      listing: { id: canonical.listingId, title },
      images: images.map(image => ({
        id: image.id,
        url: image.url,
        alt: `Published image for ${title}`
      })),
      creativePack
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error("Social Studio asset lookup error", error);
    return response.status(statusCode).json({
      error: statusCode === 500 ? "The Studio could not load listing images." : error.message
    });
  }
};
