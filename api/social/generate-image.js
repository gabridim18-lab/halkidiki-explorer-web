"use strict";

const { loadLocalEnvironment } = require("../_lib/local-env");
const { requireStudioUser } = require("../_lib/auth");
const {
  CATEGORIES,
  canonicalFacts,
  collectListingImageAssets,
  fetchCanonicalListing,
  resolveLinkedBeachNames,
  resolveRestaurantDestination
} = require("../_lib/halkidiki-data");
const {
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  composeSocialImage,
  createEnhancedBase,
  downloadCanonicalImage,
  imageError
} = require("../_lib/social-image");
const { localBusinessDetails, localBusinessLabelOptions, restaurantSupportingLabelOptions } = require("../_lib/category-profiles");
const { createDraft, createFallbackDraft } = require("./generate");

const ALLOWED_LANGUAGES = new Set(["en", "ro", "el"]);
const ALLOWED_PLATFORMS = new Set(["facebook", "instagram", "tiktok"]);
const ALLOWED_ANGLES = new Set(["general", "family", "relaxation", "location", "facilities"]);
const ALLOWED_MODES = new Set(["safe", "enhanced"]);
const IMAGE_ID = /^image-[0-7]$/;
const MAX_REQUEST_BYTES = 8_000;
const rateLimit = new Map();

loadLocalEnvironment();

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

function cleanText(value, maximum = 72) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function validateImageIds(heroImageId, supportingImageIds) {
  if (typeof heroImageId !== "string" || !IMAGE_ID.test(heroImageId)) {
    throw requestError("Choose one published hero image.");
  }

  if (!Array.isArray(supportingImageIds) || supportingImageIds.length > 3) {
    throw requestError("Choose up to three supporting images.");
  }

  const supporting = [...new Set(supportingImageIds)]
    .filter(id => typeof id === "string" && IMAGE_ID.test(id) && id !== heroImageId);

  if (supporting.length !== supportingImageIds.length) {
    throw requestError("One or more selected image identifiers are invalid.");
  }

  return { heroImageId, supportingImageIds: supporting };
}

function validateSupportingLabels(labels, supportingCount) {
  if (labels === undefined) return Array.from({ length: supportingCount }, () => "");
  if (!Array.isArray(labels) || labels.length !== supportingCount) throw requestError("Supporting image labels are invalid.");
  return labels.map(label => cleanText(label, 42));
}

function validateCanonicalRestaurantLabels(labels, record, facts, language) {
  const allowed = restaurantSupportingLabelOptions(record, facts, language);
  const byNormalizedValue = new Map(allowed.map(value => [value.toLocaleLowerCase(), value]));
  return labels.map(label => {
    if (!label) return "";
    const verified = byNormalizedValue.get(label.toLocaleLowerCase());
    if (!verified) throw requestError("Restaurant supporting labels must be selected from verified dining details.");
    return verified;
  });
}

function validateCanonicalLocalBusinessLabels(labels, details) {
  const allowed = localBusinessLabelOptions(details);
  const byNormalizedValue = new Map(allowed.map(value => [value.toLocaleLowerCase(), value]));
  return labels.map(label => {
    if (!label) return "";
    const verified = byNormalizedValue.get(label.toLocaleLowerCase());
    if (!verified) throw requestError("Local Business supporting labels must be selected from verified listing details.");
    return verified;
  });
}

function validateManualPromotion(value, category) {
  if (value === undefined || value === null) return null;
  if (category !== "accommodation" || !value || typeof value !== "object" || Array.isArray(value)) throw requestError("A promotional price is only available for accommodation.");
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw requestError("The promotional price amount is invalid.");
  if (!["EUR", "RON", "USD", "GBP"].includes(value.currency)) throw requestError("The promotional price currency is invalid.");
  if (!["night", "stay", "person"].includes(value.unit)) throw requestError("The promotional price unit is invalid.");
  return { amount, currency: value.currency, unit: value.unit };
}

function validateRequest(body) {
  const {
    category,
    listingId,
    language,
    platform,
    angle,
    mode,
    heroImageId,
    supportingImageIds,
    supportingImageLabels,
    manualPromotion,
    textOnImage,
    textOnImageSubheadline,
    includeLogo
  } = body;

  if (!Object.hasOwn(CATEGORIES, category)) throw requestError("Unknown content category.");
  if (typeof listingId !== "string") throw requestError("A listing ID is required.");
  if (!ALLOWED_LANGUAGES.has(language)) throw requestError("Unsupported language.");
  if (!ALLOWED_PLATFORMS.has(platform)) throw requestError("Unsupported platform.");
  if (!ALLOWED_ANGLES.has(angle)) throw requestError("Unsupported content angle.");
  if (!ALLOWED_MODES.has(mode)) throw requestError("Unsupported generation mode.");
  if (typeof includeLogo !== "boolean") throw requestError("A logo option is required.");

  const images = validateImageIds(heroImageId, supportingImageIds);
  return {
    category,
    listingId,
    language,
    platform,
    angle,
    mode,
    ...images,
    supportingImageLabels: validateSupportingLabels(supportingImageLabels, images.supportingImageIds.length),
    manualPromotion: validateManualPromotion(manualPromotion, category),
    textOnImage: cleanText(textOnImage),
    textOnImageSubheadline: cleanText(textOnImageSubheadline, 100),
    includeLogo
  };
}

function allowRequest(userId, mode) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maximum = mode === "enhanced" ? 4 : 20;
  const key = `${userId}:${mode}`;
  const requests = (rateLimit.get(key) || []).filter(timestamp => now - timestamp < windowMs);

  if (requests.length >= maximum) {
    throw requestError("Generation limit reached. Please try again in a few minutes.", 429);
  }

  requests.push(now);
  rateLimit.set(key, requests);
}

function imageById(assets, id) {
  const image = assets.find(asset => asset.id === id);
  if (!image) throw requestError("A selected image is not published for this listing.");
  return image;
}

function filename(listingId) {
  const safeId = String(listingId).replace(/[^a-z0-9_-]/gi, "-").slice(0, 60) || "listing";
  return `halkidiki-explorer-${safeId}-social.jpg`;
}

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (Number(request.headers["content-length"] || 0) > MAX_REQUEST_BYTES) {
    return response.status(413).json({ error: "Request is too large." });
  }

  try {
    const user = await requireStudioUser(request);
    const parameters = validateRequest(parseBody(request));
    allowRequest(user.id, parameters.mode);

    const canonical = await fetchCanonicalListing(parameters.category, parameters.listingId);
    const facts = canonicalFacts(canonical.record, canonical.indexItem, canonical.listingId);
    const restaurantFamily = parameters.category === "restaurant";
    const localBusiness = parameters.category === "local-business";
    const promotionalLocation = restaurantFamily
      ? await resolveRestaurantDestination(canonical.record, parameters.language)
      : "";
    const localBusinessContext = localBusiness
      ? { linkedBeachNames: await resolveLinkedBeachNames(canonical.record.beaches, parameters.language, 2) }
      : {};
    if (restaurantFamily && ![2, 3].includes(parameters.supportingImageIds.length)) {
      throw requestError("Restaurant posters require two or three supporting images.");
    }
    if (restaurantFamily) {
      parameters.supportingImageLabels = validateCanonicalRestaurantLabels(
        parameters.supportingImageLabels,
        canonical.record,
        facts,
        parameters.language
      );
    }
    if (localBusiness) {
      if (![2, 3].includes(parameters.supportingImageIds.length)) throw requestError("Local Business posters require two or three supporting images.");
      parameters.supportingImageLabels = validateCanonicalLocalBusinessLabels(
        parameters.supportingImageLabels,
        localBusinessDetails(canonical.record, facts, parameters.language, localBusinessContext.linkedBeachNames)
      );
    }
    const assets = collectListingImageAssets(
      canonical.record,
      canonical.config,
      canonical.listingId
    );
    const heroAsset = imageById(assets, parameters.heroImageId);
    const supportingAssets = parameters.supportingImageIds.map(id => imageById(assets, id));

    // URLs are resolved solely from the fresh canonical record, never supplied
    // by the browser. Safe mode stops here: it has no OpenAI image request.
    const [hero, ...supporting] = await Promise.all([
      downloadCanonicalImage(heroAsset.url, { role: "hero", imageId: heroAsset.id }),
      ...supportingAssets.map(asset =>
        downloadCanonicalImage(asset.url, { role: "supporting", imageId: asset.id })
      )
    ]);

    const imageUrls = assets.map(asset => asset.url);
    let draft;
    try {
      // This is the one optional text-generation call in an explicit poster
      // request. A failure never prevents a fact-only Safe layout.
      draft = await createDraft(parameters, facts, imageUrls, user.id);
    } catch (error) {
      console.warn("Social Studio poster is using deterministic copy fallback", {
        statusCode: error.statusCode || 500,
        mode: parameters.mode
      });
      draft = createFallbackDraft(parameters, facts, imageUrls);
    }
    const posterCopy = {
      ...draft,
      onImageHeadline: parameters.textOnImage || draft.onImageHeadline || draft.onImageText,
      onImageText: parameters.textOnImage || draft.onImageText,
      onImageSubheadline: parameters.textOnImageSubheadline || draft.onImageSubheadline,
      supportingImageLabels: parameters.supportingImageLabels,
      manualPromotion: parameters.manualPromotion
    };

    let visualHero = hero;
    if (parameters.mode === "enhanced") {
      visualHero = await createEnhancedBase({
        hero,
        supporting,
        facts,
        language: parameters.language,
        angle: parameters.angle,
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
        quality: process.env.SOCIAL_IMAGE_QUALITY || "medium",
        userId: user.id
      });
    }

    const visual = await composeSocialImage({
      hero: visualHero,
      supporting,
      facts,
      category: parameters.category,
      record: canonical.record,
      language: parameters.language,
      copy: posterCopy,
      includeLogo: parameters.includeLogo,
      promotionalLocation,
      localBusinessContext
    });

    return response.status(200).json({
      image: {
        mimeType: "image/jpeg",
        fileName: filename(canonical.listingId),
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        mode: parameters.mode,
        logoIncluded: parameters.includeLogo,
        dataUrl: `data:image/jpeg;base64,${visual.toString("base64")}`
      },
      draft: {
        hook: draft.hook || "",
        caption: draft.caption || "",
        cta: draft.cta || "",
        hashtags: Array.isArray(draft.hashtags) ? draft.hashtags : [],
        onImageText: posterCopy.onImageHeadline || "",
        onImageHeadline: posterCopy.onImageHeadline || "",
        onImageSubheadline: posterCopy.onImageSubheadline || ""
      }
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error("Social Studio image generation error", error);
    return response.status(statusCode).json({
      error: statusCode === 500 ? "The Studio could not create the social visual." : error.message
    });
  }
};
