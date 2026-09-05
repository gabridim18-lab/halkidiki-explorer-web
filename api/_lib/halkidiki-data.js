"use strict";

const DATA_ROOT =
  "https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data";

const CATEGORIES = Object.freeze({
  accommodation: {
    indexPath: "accommodations/accommodations-index-v2.json",
    recordDirectory: "accommodations"
  },
  beach: {
    indexPath: "beaches/beaches-index.json",
    recordDirectory: "beaches"
  },
  restaurant: {
    indexPath: "restaurants/restaurants-index.json",
    recordDirectory: "restaurants"
  },
  "local-business": {
    indexPath: "local-businesses/local-businesses-index.json",
    recordDirectory: "local-businesses"
  },
  "what-to-do": {
    indexPath: "what-to-do/what-to-do-index.json",
    recordDirectory: "what-to-do"
  }
});

// IDs are checked against the remote category index as well as this format.
// No slash, period, URL, or query string can reach a server-side fetch path.
const SAFE_ID = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,119}$/u;
const SAFE_IMAGE_FILE = /^[\p{L}\p{N}][\p{L}\p{N}_. -]{0,180}$/u;

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function dataError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getCategory(category) {
  if (typeof category !== "string" || !Object.hasOwn(CATEGORIES, category)) {
    throw inputError("Unknown content category.");
  }

  return CATEGORIES[category];
}

function validateListingId(listingId) {
  if (typeof listingId !== "string" || !SAFE_ID.test(listingId)) {
    throw inputError("Invalid listing ID.");
  }

  return listingId;
}

async function fetchDataJson(path) {
  const response = await fetch(`${DATA_ROOT}/${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw dataError("The official Halkidiki data source is unavailable.");
  }

  try {
    return await response.json();
  } catch {
    throw dataError("The official Halkidiki data source returned invalid JSON.");
  }
}

async function fetchCanonicalListing(category, listingId) {
  const config = getCategory(category);
  const safeId = validateListingId(listingId);
  const index = await fetchDataJson(config.indexPath);

  if (!Array.isArray(index)) {
    throw dataError("The official listing index has an unexpected format.");
  }

  const indexItem = index.find(item => item?.id === safeId);
  if (!indexItem) {
    throw inputError("That listing is not available in the selected category.");
  }

  const record = await fetchDataJson(
    `${config.recordDirectory}/${encodeURIComponent(safeId)}/index.json`
  );

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw dataError("The official listing record has an unexpected format.");
  }

  return { category, listingId: safeId, indexItem, record, config };
}

function shortString(value, length = 2000) {
  return typeof value === "string" ? value.trim().slice(0, length) : undefined;
}

function shortStringArray(value, maximum = 20) {
  if (!Array.isArray(value)) return undefined;
  const result = value
    .filter(item => typeof item === "string")
    .map(item => item.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, maximum);
  return result.length ? result : undefined;
}

function selectedObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const output = {};
  ["en", "ro", "el", "gr"].forEach(key => {
    const text = shortString(value[key]);
    if (text) output[key] = text;
  });
  return Object.keys(output).length ? output : undefined;
}

/**
 * Builds a bounded, presentation-focused view of the canonical record. This
 * keeps irrelevant fields out of the prompt and prevents client-supplied facts.
 */
function canonicalFacts(record, indexItem, listingId) {
  const facts = { id: listingId };
  const stringKeys = [
    "title", "titleEn", "titleRo", "titleEl", "description", "descriptionEn",
    "descriptionRo", "descriptionEl", "shortDescriptionEn", "shortDescriptionRo", "shortDescriptionEl",
    "category", "categoryEn", "categoryRo",
    "categoryEl", "type", "zone", "beachSlug", "address", "hours", "hoursEn",
    "hoursRo", "price", "rating", "ratingScale", "distanceMetersOverride", "view", "sizeSqm"
  ];
  const arrayKeys = [
    "features", "facilities", "amenities", "highlights", "activities", "cuisineTypes",
    "serviceOptions", "offerings", "diningOptions", "planning", "payments",
    "accessibility", "children", "parking", "pets"
  ];

  stringKeys.forEach(key => {
    const value = shortString(record[key]);
    if (value) facts[key] = value;
  });

  ["name", "description", "hours", "highlights"].forEach(key => {
    const value = selectedObject(record[key]);
    if (value) facts[key] = value;
  });

  arrayKeys.forEach(key => {
    const value = shortStringArray(record[key]);
    if (value) facts[key] = value;
  });

  [
    "pool", "petFriendly", "guests", "bedrooms", "bathrooms", "wifi", "airConditioning",
    "parking", "kitchen", "washer", "balcony", "bbq", "garden", "seaView",
    "distanceMetersOverride", "rating", "ratingScale", "sizeSqm"
  ].forEach(key => {
    if (typeof record[key] === "boolean" || typeof record[key] === "number") {
      facts[key] = record[key];
    }
  });

  // Some records contain only their index metadata. Use it only as a fallback.
  ["titleEn", "titleRo", "zone", "type", "category"].forEach(key => {
    if (facts[key] === undefined) {
      const value = shortString(indexItem?.[key]);
      if (value) facts[key] = value;
    }
  });

  return facts;
}

function displaySlug(slug) {
  if (typeof slug !== "string" || !SAFE_ID.test(slug)) return "";
  return slug.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\p{L}/gu, character => character.toLocaleUpperCase());
}

function localizedRecordTitle(record, language = "en") {
  const suffix = { en: "En", ro: "Ro", el: "El" }[language] || "En";
  const title = shortString(record?.[`title${suffix}`], 100)
    || shortString(record?.title, 100)
    || shortString(record?.title?.[language], 100)
    || shortString(record?.title?.en, 100)
    || shortString(record?.title?.ro, 100)
    || shortString(record?.title?.el, 100)
    || shortString(record?.name?.[language], 100)
    || shortString(record?.name?.en, 100)
    || shortString(record?.name?.ro, 100)
    || shortString(record?.name?.el, 100);
  return title || "";
}

/**
 * Restaurant promotional locations must name the linked local destination,
 * never substitute the broad restaurant zone.  The beach slug is validated
 * before it is used in a canonical index lookup, and a readable slug is a
 * bounded fallback when the linked beach record is absent.
 */
async function resolveRestaurantDestination(record, language = "en") {
  const slug = typeof record?.beachSlug === "string" ? record.beachSlug : "";
  const fallback = displaySlug(slug);
  if (fallback) {
    try {
      const linkedBeach = await fetchCanonicalListing("beach", slug);
      return localizedRecordTitle(linkedBeach.record, language) || fallback;
    } catch {
      return fallback;
    }
  }

  return shortString(record?.address || record?.displayAddress, 100) || "";
}

function beachIdCandidates(value) {
  if (typeof value !== "string") return [];
  const candidates = [value.trim(), value.trim().replace(/_/g, "-"), value.trim().replace(/-/g, "_")];
  return [...new Set(candidates.filter(candidate => SAFE_ID.test(candidate)))];
}

async function resolveLinkedBeachName(value, language = "en") {
  const candidates = beachIdCandidates(value);
  for (const candidate of candidates) {
    try {
      const linkedBeach = await fetchCanonicalListing("beach", candidate);
      const title = localizedRecordTitle(linkedBeach.record, language);
      if (title) return title;
    } catch {
      // Try the next normalized canonical ID, then use a safe display fallback.
    }
  }
  return displaySlug(candidates[0] || "");
}

async function resolveLinkedBeachNames(values, language = "en", maximum = 2) {
  if (!Array.isArray(values) || maximum < 1) return [];
  const resolved = [];
  for (const value of values.slice(0, Math.min(values.length, 12))) {
    const name = await resolveLinkedBeachName(value, language);
    if (name && !resolved.some(existing => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) resolved.push(name);
    if (resolved.length >= maximum) break;
  }
  return resolved;
}

function toImageUrl(value, config, listingId) {
  if (typeof value !== "string" || !value.trim()) return null;
  const image = value.trim();

  if (/^https:\/\//i.test(image)) return image;
  if (!SAFE_IMAGE_FILE.test(image)) return null;

  return `${DATA_ROOT}/${config.recordDirectory}/${encodeURIComponent(listingId)}/images/${encodeURIComponent(image)}`;
}

function collectListingImages(record, config, listingId) {
  return collectListingImageAssets(record, config, listingId).map(asset => asset.url);
}

/**
 * Gives the Studio stable, server-derived identifiers for published images.
 * The browser may display these URLs, but it submits only the identifier when
 * requesting a final visual. That prevents it from selecting an arbitrary URL.
 */
function collectListingImageAssets(record, config, listingId) {
  const candidates = [record.heroImage, ...(Array.isArray(record.images) ? record.images : [])];
  const seen = new Set();

  return candidates
    .map(image => toImageUrl(image, config, listingId))
    .filter(image => image && !seen.has(image) && seen.add(image))
    .slice(0, 8)
    .map((url, index) => ({
      id: `image-${index}`,
      url,
      sourceIndex: index
    }));
}

module.exports = {
  CATEGORIES,
  canonicalFacts,
  collectListingImages,
  collectListingImageAssets,
  fetchCanonicalListing,
  resolveLinkedBeachNames,
  resolveRestaurantDestination
};
