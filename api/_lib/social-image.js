"use strict";

const crypto = require("crypto");
const path = require("path");
const sharp = require("sharp");
const { localBusinessDetails, localBusinessSupportingLabels, profileCta, profileFacts, profileHeadline, resolveCategoryProfile, restaurantFamilyDetails, restaurantFamilySupportingLabels, supportingPhotoLabels } = require("./category-profiles");

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1350;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const CANONICAL_IMAGE_HOSTS = new Set(["raw.githubusercontent.com"]);

// Accommodation Safe Branded layout. These values deliberately describe the
// complete vertical stack so it can be tuned as a single composition.
const ACCOMMODATION_LAYOUT = Object.freeze({
  heroY: 0,
  heroHeight: 835,
  titleY: 570,
  titleLineHeight: 64,
  titleLocationGap: 14,
  factRowGap: 34,
  factRowHeight: 70,
  factX: 40,
  factWidth: 238,
  factGap: 16,
  supportY: 835,
  supportHeight: 250,
  supportGap: 10,
  footerY: 1085,
  footerHeight: 265,
  priceX: 709,
  priceY: 32,
  priceWidth: 329,
  priceHeight: 87,
  heroGradientY: 530,
  footerLeadY: 1155,
  footerBrandY: 1205,
  footerDetailY: 1247,
  footerMoreY: 1279,
  logoX: 32,
  logoY: 78,
  logoWidth: 178
});

const BEACH_LAYOUT = Object.freeze({
  heroY: 0,
  heroHeight: 800,
  titleY: 520,
  titleLineHeight: 62,
  titleLocationGap: 14,
  factRowGap: 34,
  factRowHeight: 68,
  factX: 40,
  factWidth: 238,
  factGap: 16,
  supportY: 800,
  supportHeight: 270,
  supportGap: 10,
  footerY: 1070,
  footerHeight: 280,
  heroGradientY: 480,
  logoX: 34,
  logoY: 74,
  logoWidth: 122
});

// Restaurant / Taverna Safe Branded layout.  It deliberately has no coloured
// footer: the full poster is canonical photography, with the identity placed
// at the hero-to-gallery transition.
const RESTAURANT_LAYOUT = Object.freeze({
  heroY: 0,
  heroHeight: 945,
  supportY: 945,
  supportHeight: 405,
  supportGap: 10,
  titleX: 54,
  // The former title baseline was 765px.  840px moves the one-line identity
  // group roughly 10% lower in the hero while preserving gallery clearance.
  titleY: 840,
  metaGap: 18,
  detailGap: 30,
  logoX: 38,
  logoY: 42,
  // 108px is 50% larger than the former generic 72px restaurant logo.
  logoWidth: 108,
  heroGradientY: 650
});

// Local Business deliberately reuses the approved photo-first proportions,
// while retaining separate constants and content hierarchy from Restaurant.
const LOCAL_BUSINESS_LAYOUT = Object.freeze({
  heroY: 0,
  heroHeight: 945,
  supportY: 945,
  supportHeight: 405,
  supportGap: 10,
  titleX: 54,
  titleY: 840,
  metaGap: 18,
  detailGap: 30,
  logoX: 38,
  logoY: 42,
  logoWidth: 108,
  heroGradientY: 650
});

function imageError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function escapeXml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function clean(value, maximum = 120) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
}

function localizedTitle(facts, language) {
  const suffix = { en: "En", ro: "Ro", el: "El" }[language] || "En";
  return clean(facts[`title${suffix}`] || facts.title || facts.name?.[language] || facts.name?.en || facts.id, 100);
}

function wordsToLines(text, maximum = 30, limit = 2) {
  const words = clean(text, 150).split(" ").filter(Boolean);
  const lines = [];
  for (const word of words) {
    const current = lines[lines.length - 1] || "";
    if (current && `${current} ${word}`.length > maximum && lines.length < limit) lines.push(word);
    else if (lines.length) lines[lines.length - 1] = current ? `${current} ${word}` : word;
    else lines.push(word);
  }
  return lines.slice(0, limit);
}

function dictionary(language) {
  const copy = {
    en: { guests: "guests", bedrooms: "bedrooms", bathrooms: "bathrooms", beach: "to beach", wifi: "Wi-Fi", ac: "A/C", parking: "Parking", pool: "Pool", balcony: "Balcony", garden: "Garden", view: "View", location: "Location", explore: "Explore this place", stay: "Plan your stay", visit: "Plan your visit", discover: "Discover" },
    ro: { guests: "oaspeți", bedrooms: "dormitoare", bathrooms: "băi", beach: "până la plajă", wifi: "Wi-Fi", ac: "A/C", parking: "Parcare", pool: "Piscină", balcony: "Balcon", garden: "Grădină", view: "Vedere", location: "Locație", explore: "Descoperă acest loc", stay: "Planifică-ți sejurul", visit: "Planifică vizita", discover: "Descoperă" },
    el: { guests: "επισκέπτες", bedrooms: "υπνοδωμάτια", bathrooms: "μπάνιο", beach: "από την παραλία", wifi: "Wi‑Fi", ac: "A/C", parking: "Πάρκινγκ", pool: "Πισίνα", balcony: "Μπαλκόνι", garden: "Κήπος", view: "Θέα", location: "Τοποθεσία", explore: "Εξερευνήστε αυτό το μέρος", stay: "Σχεδιάστε τη διαμονή σας", visit: "Σχεδιάστε την επίσκεψή σας", discover: "Ανακαλύψτε" }
  };
  return copy[language] || copy.en;
}

function fact(icon, value) {
  return value ? { icon, value: clean(value, 42) } : null;
}

function quantity(value, key, language) {
  const t = dictionary(language);
  if (language === "en") {
    const singular = { guests: "guest", bedrooms: "bedroom", bathrooms: "bathroom" }[key];
    return `${value} ${value === 1 ? singular : t[key]}`;
  }
  return `${value} ${t[key]}`;
}

function categoryFacts(category, facts, language, record = facts) {
  const extracted = profileFacts(category, record, facts, language).groups.flatMap(group => group.facts)
    .filter(item => item.id !== "category" && item.id !== "location")
    .sort((a, b) => b.priority - a.priority);
  const unique = new Set();
  return extracted.map(item => fact(clean(item.label, 1).toUpperCase(), item.value))
    .filter(item => item && !unique.has(item.value.toLowerCase()) && unique.add(item.value.toLowerCase()))
    .slice(0, 6);
}

function supportingLabels(category, facts, language, count, record = facts) {
  return supportingPhotoLabels(resolveCategoryProfile(category, record), count).map(label => clean(label, 28));
}

function fallbackHeadline(category, facts, language, record = facts) {
  return profileHeadline(resolveCategoryProfile(category, record), localizedTitle(facts, language), language);
}

function promotionText(promotion, facts) {
  if (promotion && Number.isFinite(promotion.amount)) {
    const symbol = { EUR: "€", RON: "RON ", USD: "$", GBP: "£" }[promotion.currency] || "";
    return `From ${symbol}${promotion.amount} / ${promotion.unit}`;
  }
  return clean(facts.price, 48);
}

function accommodationPrimaryFacts(facts, record, language, promotion) {
  const primary = [];
  const add = (icon, label, value) => { const item = fact(icon, value); if (item) primary.push({ ...item, label }); };
  const guests = record?.guests ?? facts.guests;
  const bedrooms = record?.bedrooms ?? facts.bedrooms;
  const distance = record?.distanceMetersOverride ?? facts.distanceMetersOverride;
  const pool = record?.pool ?? facts.pool;
  if (Number.isFinite(guests)) add("G", "MAX GUESTS", `Up to ${quantity(guests, "guests", language)}`);
  if (Number.isFinite(bedrooms)) add("B", "BEDROOMS", quantity(bedrooms, "bedrooms", language));
  if (Number.isFinite(distance)) add("M", "TO BEACH", `${distance} m ${dictionary(language).beach}`);
  if (pool) add("P", "POOL", dictionary(language).pool);
  if (primary.length < 4 && Number.isFinite(record?.bathrooms ?? facts.bathrooms)) {
    add("W", "BATHROOMS", quantity(record?.bathrooms ?? facts.bathrooms, "bathrooms", language));
  }
  if (primary.length < 4 && (record?.wifi ?? facts.wifi)) add("W", "WI-FI", dictionary(language).wifi);
  if (primary.length < 4 && (record?.airConditioning ?? facts.airConditioning)) add("A", "A/C", dictionary(language).ac);
  if (primary.length < 4 && (record?.parking ?? facts.parking)) add("P", "PARKING", dictionary(language).parking);
  return primary.slice(0, 4);
}

function beachPrimaryFacts(facts, record, language) {
  const available = new Map(profileFacts("beach", record, facts, language).groups.flatMap(group => group.facts).map(item => [item.id, item]));
  const priority = ["family-friendly", "water-entry", "water-depth", "beach-type", "sand", "blue-flag", "water-clarity", "sunbeds", "accessible", "parking-available", "activities"];
  const labels = {
    "family-friendly": "FAMILY", "water-entry": "WATER ENTRY", "water-depth": "WATER DEPTH", "beach-type": "BEACH TYPE", "sand": "SAND",
    "blue-flag": "BLUE FLAG", "water-clarity": "WATER", sunbeds: "SUNBEDS", accessible: "ACCESS", "parking-available": "PARKING", activities: "ACTIVITIES"
  };
  return priority.map(id => available.get(id)).filter(Boolean).slice(0, 4).map(item => ({
    icon: clean(item.label, 1).toUpperCase(),
    label: labels[item.id] || clean(item.label, 18).toUpperCase(),
    value: clean(item.value, 42)
  }));
}

function restaurantIdentity(facts, record, language) { return restaurantFamilyDetails(record, facts, language); }

function posterData({ category, facts, language, copy, supportingCount, record = facts, promotionalLocation = "", localBusinessContext = {} }) {
  const profile = resolveCategoryProfile(category, record);
  const business = category === "local-business" ? localBusinessDetails(record, facts, language, localBusinessContext.linkedBeachNames) : null;
  const headline = clean(copy?.onImageHeadline || copy?.onImageText || fallbackHeadline(category, facts, language, record), 72);
  const subheadline = clean(copy?.onImageSubheadline || "", 90) || categoryFacts(category, facts, language, record).slice(0, 3).map(item => item.value).join(" • ");
  const cta = clean(profile.id === "accommodation" ? "Find this stay on Halkidiki Explorer" : copy?.cta || profileCta(profile, language), 64);
  return {
    title: localizedTitle(facts, language),
    headline,
    subheadline,
    cta,
    location: category === "restaurant"
      ? clean(promotionalLocation, 100)
      : category === "local-business"
        ? clean(business?.location || business?.linkedBeaches?.[0], 100)
      : clean(facts.zone || facts.beachSlug || facts.address, 45),
    facts: categoryFacts(category, facts, language, record),
    supportingLabels: category === "restaurant"
      ? Array.from({ length: supportingCount }, (_, index) => clean(copy?.supportingImageLabels?.[index], 42) || restaurantFamilySupportingLabels(record, facts, language, supportingCount)[index] || "")
      : category === "local-business"
        ? Array.from({ length: supportingCount }, (_, index) => clean(copy?.supportingImageLabels?.[index], 42) || localBusinessSupportingLabels(business, supportingCount)[index] || "")
      : profile.id === "accommodation" || profile.id === "beach"
        ? Array.from({ length: supportingCount }, (_, index) => clean(copy?.supportingImageLabels?.[index], 28))
      : supportingLabels(category, facts, language, supportingCount, record)
        .map((label, index) => clean(copy?.supportingImageLabels?.[index] || label, 28)),
    variant: profile.posterVariant,
    primaryFacts: profile.id === "accommodation" ? accommodationPrimaryFacts(facts, record, language, copy?.manualPromotion) : [],
    beachFacts: profile.id === "beach" ? beachPrimaryFacts(facts, record, language) : [],
    restaurantIdentity: category === "restaurant" ? restaurantIdentity(facts, record, language) : {},
    localBusiness: business || {},
    priceText: profile.id === "accommodation" ? promotionText(copy?.manualPromotion, facts) : ""
  };
}

function safeCanonicalUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw imageError("A published image has an invalid source URL.", 502); }
  if (parsed.protocol !== "https:" || !CANONICAL_IMAGE_HOSTS.has(parsed.hostname)) {
    throw imageError("A published image has an unsupported source location.", 502);
  }
  return parsed;
}

function logImageDiagnostic(values) {
  // Deliberately excludes URLs, image payloads, credentials, and user data.
  console.info("Social Studio canonical image diagnostic", values);
}

async function downloadCanonicalImage(url, source = {}) {
  safeCanonicalUrl(url);
  let response;
  try {
    response = await fetch(url, { headers: { Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" }, signal: AbortSignal.timeout(15_000) });
  } catch {
    logImageDiagnostic({ role: source.role || "unknown", imageId: source.imageId || "unknown", fetchStatus: "network-error" });
    throw imageError("A published listing image could not be downloaded.", 502);
  }
  const length = Number(response.headers.get("content-length") || 0);
  const contentType = response.headers.get("content-type") || "";
  logImageDiagnostic({
    role: source.role || "unknown",
    imageId: source.imageId || "unknown",
    fetchStatus: response.status,
    contentType,
    contentLength: length || undefined
  });
  if (!response.ok || (length && length > MAX_SOURCE_BYTES)) throw imageError("A published listing image is unavailable or too large.", 502);
  if (!contentType.startsWith("image/")) throw imageError("A published listing image has an unsupported format.", 502);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw imageError("A published listing image is unavailable or too large.", 502);
  try {
    const metadata = await sharp(bytes, { limitInputPixels: 25_000_000 }).metadata();
    logImageDiagnostic({
      role: source.role || "unknown",
      imageId: source.imageId || "unknown",
      fetchStatus: response.status,
      contentType,
      bufferBytes: bytes.length,
      sharp: { width: metadata.width, height: metadata.height, format: metadata.format }
    });
  } catch {
    logImageDiagnostic({ role: source.role || "unknown", imageId: source.imageId || "unknown", bufferBytes: bytes.length, sharp: "decode-failed" });
    throw imageError("A published listing image could not be processed.", 502);
  }
  return bytes;
}

async function toCardImage(input, width, height) {
  return sharp(input, { limitInputPixels: 25_000_000 }).rotate().resize(width, height, { fit: "cover", position: "attention" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

function supportPositions(count) {
  if (!count) return [];
  if (count === 1) return [{ left: 40, top: 1020, width: 1000, height: 170 }];
  if (count === 2) return [{ left: 40, top: 1020, width: 488, height: 170 }, { left: 552, top: 1020, width: 488, height: 170 }];
  return [{ left: 40, top: 1020, width: 318, height: 170 }, { left: 381, top: 1020, width: 318, height: 170 }, { left: 722, top: 1020, width: 318, height: 170 }];
}

function posterSvg(poster, positions, includeLogo) {
  const theme = {
    property: ["#071a33", "#087df1", "#087df1"], coastal: ["#063c5e", "#00a9c8", "#009fc0"], dining: ["#3e2145", "#c66844", "#bd5c3b"],
    "beach-energy": ["#142146", "#de5b70", "#d94d67"], service: ["#10365b", "#2386b8", "#1e7fae"], activity: ["#17354f", "#df8d26", "#d7821b"]
  }[poster.variant] || ["#071a33", "#087df1", "#087df1"];
  const headline = wordsToLines(poster.headline, 31, 2);
  const headlineSvg = headline.map((line, index) => `<text x="58" y="${602 + index * 54}" class="headline">${escapeXml(line)}</text>`).join("");
  const subY = 602 + headline.length * 54 + 14;
  const factSvg = poster.facts.map((item, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = 52 + column * 326;
    const y = 766 + row * 82;
    return `<g><rect x="${x}" y="${y}" width="302" height="64" rx="18" fill="#edf6ff"/><circle cx="${x + 30}" cy="${y + 32}" r="18" fill="${theme[2]}"/><text x="${x + 30}" y="${y + 38}" class="icon" text-anchor="middle">${escapeXml(item.icon)}</text><text x="${x + 58}" y="${y + 39}" class="fact">${escapeXml(item.value)}</text></g>`;
  }).join("");
  const labelsSvg = positions.map((position, index) => `<g><rect x="${position.left + 8}" y="${position.top + position.height - 42}" width="${Math.max(120, position.width - 16)}" height="34" rx="11" fill="#071a33" fill-opacity=".78"/><text x="${position.left + 20}" y="${position.top + position.height - 19}" class="photoLabel">${escapeXml(poster.supportingLabels[index])}</text></g>`).join("");
  return Buffer.from(`<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="top" x1="0" x2="1"><stop stop-color="${theme[0]}"/><stop offset="1" stop-color="${theme[1]}"/></linearGradient><linearGradient id="heroShade" x1="0" y1="0" x2="0" y2="1"><stop offset="38%" stop-color="${theme[0]}" stop-opacity="0"/><stop offset="100%" stop-color="${theme[0]}" stop-opacity=".9"/></linearGradient></defs>
    <style>.headline{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:47px;font-weight:800;letter-spacing:-.8px}.sub{fill:#d7efff;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:700}.pill{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:800}.icon{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:800}.fact{fill:#10213a;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:800}.photoLabel{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800}.cta{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:800;letter-spacing:-.3px}.ctaSmall{fill:#9fdcff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700}</style>
    <rect width="1080" height="98" fill="url(#top)"/>
    <rect x="${poster.location ? 690 : 856}" y="27" width="${poster.location ? 350 : 192}" height="43" rx="21" fill="#fff" fill-opacity=".96"/><text x="${poster.location ? 712 : 878}" y="55" class="pill">${escapeXml(poster.location || "Halkidiki")}</text>
    <rect y="98" width="1080" height="620" fill="url(#heroShade)"/>
    ${headlineSvg}<text x="61" y="${subY}" class="sub">${escapeXml(poster.subheadline)}</text>
    <rect x="28" y="738" width="1024" height="238" rx="30" fill="#fff"/><text x="54" y="752" fill="#087df1" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="800" letter-spacing="2">VERIFIED LISTING DETAILS</text>
    ${factSvg}
    ${labelsSvg}
    <rect y="1210" width="1080" height="140" fill="url(#top)"/><text x="54" y="1264" class="cta">${escapeXml(poster.cta)}</text><text x="57" y="1300" class="ctaSmall">Halkidiki Explorer • verified local listings</text>
  </svg>`);
}

function accommodationPositions(count) {
  if (!count) return [];
  const { supportY, supportHeight, supportGap } = ACCOMMODATION_LAYOUT;
  if (count === 1) return [{ left: 0, top: supportY, width: OUTPUT_WIDTH, height: supportHeight }];
  if (count === 2) {
    const width = Math.floor((OUTPUT_WIDTH - supportGap) / 2);
    return [{ left: 0, top: supportY, width, height: supportHeight }, { left: width + supportGap, top: supportY, width, height: supportHeight }];
  }
  const width = Math.floor((OUTPUT_WIDTH - supportGap * 2) / 3);
  return Array.from({ length: 3 }, (_, index) => ({ left: index * (width + supportGap), top: supportY, width, height: supportHeight }));
}

function accommodationPosterSvg(poster, positions) {
  const layout = ACCOMMODATION_LAYOUT;
  const title = wordsToLines(poster.title, 24, 2);
  const titleSvg = title.map((line, index) => `<text x="58" y="${layout.titleY + index * layout.titleLineHeight}" class="propertyName">${escapeXml(line)}</text>`).join("");
  const locationY = layout.titleY + title.length * layout.titleLineHeight + layout.titleLocationGap;
  const priceBadge = poster.priceText ? `<g><rect x="${layout.priceX}" y="${layout.priceY}" width="${layout.priceWidth}" height="${layout.priceHeight}" rx="23" fill="#fff" fill-opacity=".97"/><text x="${layout.priceX + 27}" y="${layout.priceY + 33}" class="priceLabel">PRICE FROM</text><text x="${layout.priceX + 27}" y="${layout.priceY + 67}" class="priceValue">${escapeXml(poster.priceText)}</text></g>` : "";
  const factColumns = 4;
  const factTop = locationY + layout.factRowGap;
  const factsSvg = poster.primaryFacts.map((item, index) => {
    const column = index % factColumns;
    const row = Math.floor(index / factColumns);
    const x = layout.factX + column * (layout.factWidth + layout.factGap);
    const y = factTop + row * (layout.factRowHeight + 12);
    return `<g><rect x="${x}" y="${y}" width="${layout.factWidth}" height="${layout.factRowHeight}" rx="18" fill="#061b31" fill-opacity=".76" stroke="#d9efff" stroke-opacity=".28"/><text x="${x + 19}" y="${y + 26}" class="primaryLabel">${escapeXml(item.label)}</text><text x="${x + 19}" y="${y + 53}" class="primaryValue">${escapeXml(item.value)}</text></g>`;
  }).join("");
  const labelsSvg = positions.map((position, index) => poster.supportingLabels[index] ? `<g><rect x="${position.left + 8}" y="${position.top + position.height - 40}" width="${Math.max(120, position.width - 16)}" height="32" rx="10" fill="#082342" fill-opacity=".82"/><text x="${position.left + 19}" y="${position.top + position.height - 18}" class="photoLabel">${escapeXml(poster.supportingLabels[index])}</text></g>` : "").join("");
  return Buffer.from(`<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="heroShade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#06172d" stop-opacity="0"/><stop offset="100%" stop-color="#06172d" stop-opacity=".34"/></linearGradient><linearGradient id="footer" x1="0" x2="1"><stop stop-color="#071a33"/><stop offset="1" stop-color="#087df1"/></linearGradient></defs>
    <style>.propertyName{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:62px;font-weight:800;letter-spacing:-1.2px}.location{fill:#f5fbff;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700}.eyebrow{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;letter-spacing:2px}.priceLabel{fill:#3172a5;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:800;letter-spacing:1px}.priceValue{fill:#0b2742;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:800}.primaryLabel{fill:#bfe6ff;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:.7px}.primaryValue{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800}.photoLabel{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800}.footerLead{fill:#cceeff;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700}.footerBrand{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:37px;font-weight:800;letter-spacing:.3px}.footerSmall{fill:#bde8ff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700}</style>
    <rect y="${layout.heroGradientY}" width="1080" height="${layout.heroHeight - layout.heroGradientY}" fill="url(#heroShade)"/>
    <text x="58" y="62" class="eyebrow">HALKIDIKI EXPLORER · ACCOMMODATION</text>${priceBadge}
    ${titleSvg}<text x="61" y="${locationY}" class="location">${escapeXml(poster.location || "Halkidiki")}</text>
    ${factsSvg}${labelsSvg}
    <rect y="${layout.footerY}" width="1080" height="${layout.footerHeight}" fill="url(#footer)"/><text x="54" y="${layout.footerLeadY}" class="footerLead">Find this stay on</text><text x="54" y="${layout.footerBrandY}" class="footerBrand">HALKIDIKI EXPLORER</text><text x="57" y="${layout.footerDetailY}" class="footerSmall">Verified stays · Local Halkidiki guide</text><text x="57" y="${layout.footerMoreY}" class="footerSmall">More details in Halkidiki Explorer</text>
  </svg>`);
}

async function composeAccommodationImage({ hero, supporting = [], facts, language, copy, includeLogo, record }) {
  const positions = accommodationPositions(Math.min(supporting.length, 3));
  const composites = [{ input: await toCardImage(hero, OUTPUT_WIDTH, ACCOMMODATION_LAYOUT.heroHeight), left: ACCOMMODATION_LAYOUT.heroY, top: ACCOMMODATION_LAYOUT.heroY }];
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    composites.push({ input: await toCardImage(supporting[index], position.width, position.height), left: position.left, top: position.top });
  }
  const poster = posterData({ category: "accommodation", facts, language, copy, supportingCount: positions.length, record });
  composites.push({ input: accommodationPosterSvg(poster, positions), left: 0, top: 0 });
  if (includeLogo) {
    const logoPath = path.join(process.cwd(), "images", "logo.png");
    const logo = await sharp(logoPath).resize({ width: ACCOMMODATION_LAYOUT.logoWidth, height: ACCOMMODATION_LAYOUT.logoWidth, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    composites.push({ input: logo, left: ACCOMMODATION_LAYOUT.logoX, top: ACCOMMODATION_LAYOUT.logoY });
  }
  return sharp({ create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3, background: "#071a33" } }).composite(composites).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

function beachPositions(count) {
  if (!count) return [];
  const { supportY, supportHeight, supportGap } = BEACH_LAYOUT;
  if (count === 1) return [{ left: 0, top: supportY, width: OUTPUT_WIDTH, height: supportHeight }];
  const width = Math.floor((OUTPUT_WIDTH - supportGap) / 2);
  return [{ left: 0, top: supportY, width, height: supportHeight }, { left: width + supportGap, top: supportY, width, height: supportHeight }];
}

function beachPosterSvg(poster, positions) {
  const layout = BEACH_LAYOUT;
  const title = wordsToLines(poster.title, 25, 2);
  const titleSvg = title.map((line, index) => `<text x="56" y="${layout.titleY + index * layout.titleLineHeight}" class="beachName">${escapeXml(line)}</text>`).join("");
  const locationY = layout.titleY + title.length * layout.titleLineHeight + layout.titleLocationGap;
  const factTop = locationY + layout.factRowGap;
  const factSvg = poster.beachFacts.map((item, index) => {
    const x = layout.factX + index * (layout.factWidth + layout.factGap);
    return `<g><rect x="${x}" y="${factTop}" width="${layout.factWidth}" height="${layout.factRowHeight}" rx="18" fill="#06324d" fill-opacity=".76" stroke="#c8f4fa" stroke-opacity=".3"/><text x="${x + 18}" y="${factTop + 26}" class="beachFactLabel">${escapeXml(item.label)}</text><text x="${x + 18}" y="${factTop + 52}" class="beachFactValue">${escapeXml(item.value)}</text></g>`;
  }).join("");
  const labelsSvg = positions.map((position, index) => poster.supportingLabels[index] ? `<g><rect x="${position.left + 8}" y="${position.top + position.height - 40}" width="${Math.max(120, position.width - 16)}" height="32" rx="10" fill="#06324d" fill-opacity=".82"/><text x="${position.left + 19}" y="${position.top + position.height - 18}" class="photoLabel">${escapeXml(poster.supportingLabels[index])}</text></g>` : "").join("");
  return Buffer.from(`<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="beachShade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#06324d" stop-opacity="0"/><stop offset="100%" stop-color="#06324d" stop-opacity=".32"/></linearGradient><linearGradient id="beachFooter" x1="0" x2="1"><stop stop-color="#06324d"/><stop offset="1" stop-color="#00abc1"/></linearGradient></defs>
    <style>.beachName{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:62px;font-weight:800;letter-spacing:-1.2px}.beachLocation{fill:#edffff;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700}.beachEyebrow{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;letter-spacing:2px}.beachFactLabel{fill:#bff3f7;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:800;letter-spacing:.7px}.beachFactValue{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800}.photoLabel{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:800}.footerLead{fill:#c9f8fc;font-family:Arial,Helvetica,sans-serif;font-size:23px;font-weight:700}.footerBrand{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:37px;font-weight:800;letter-spacing:.3px}.footerSmall{fill:#cbf5f8;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700}</style>
    <rect y="${layout.heroGradientY}" width="1080" height="${layout.heroHeight - layout.heroGradientY}" fill="url(#beachShade)"/>
    <text x="56" y="62" class="beachEyebrow">HALKIDIKI EXPLORER · BEACH</text>
    ${titleSvg}<text x="59" y="${locationY}" class="beachLocation">${escapeXml([poster.location, "Halkidiki"].filter((value, index, array) => value && array.indexOf(value) === index).join(", "))}</text>
    ${factSvg}${labelsSvg}
    <rect y="${layout.footerY}" width="1080" height="${layout.footerHeight}" fill="url(#beachFooter)"/><text x="54" y="1146" class="footerLead">Discover this beach on</text><text x="54" y="1196" class="footerBrand">HALKIDIKI EXPLORER</text><text x="57" y="1239" class="footerSmall">Beaches · Local tips · Halkidiki guide</text><text x="57" y="1271" class="footerSmall">Explore more of Halkidiki</text>
  </svg>`);
}

async function composeBeachImage({ hero, supporting = [], facts, language, copy, includeLogo, record }) {
  const positions = beachPositions(Math.min(supporting.length, 2));
  const composites = [{ input: await toCardImage(hero, OUTPUT_WIDTH, BEACH_LAYOUT.heroHeight), left: BEACH_LAYOUT.heroY, top: BEACH_LAYOUT.heroY }];
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    composites.push({ input: await toCardImage(supporting[index], position.width, position.height), left: position.left, top: position.top });
  }
  const poster = posterData({ category: "beach", facts, language, copy, supportingCount: positions.length, record });
  composites.push({ input: beachPosterSvg(poster, positions), left: 0, top: 0 });
  if (includeLogo) {
    const logoPath = path.join(process.cwd(), "images", "logo.png");
    const logo = await sharp(logoPath).resize({ width: BEACH_LAYOUT.logoWidth, height: BEACH_LAYOUT.logoWidth, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    composites.push({ input: logo, left: BEACH_LAYOUT.logoX, top: BEACH_LAYOUT.logoY });
  }
  return sharp({ create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3, background: "#06324d" } }).composite(composites).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

function restaurantPositions(count) {
  if (count === 2) {
    const width = Math.floor((OUTPUT_WIDTH - RESTAURANT_LAYOUT.supportGap) / 2);
    return [{ left: 0, top: RESTAURANT_LAYOUT.supportY, width, height: RESTAURANT_LAYOUT.supportHeight }, { left: width + RESTAURANT_LAYOUT.supportGap, top: RESTAURANT_LAYOUT.supportY, width, height: RESTAURANT_LAYOUT.supportHeight }];
  }
  const width = Math.floor((OUTPUT_WIDTH - RESTAURANT_LAYOUT.supportGap * 2) / 3);
  return Array.from({ length: 3 }, (_, index) => ({ left: index * (width + RESTAURANT_LAYOUT.supportGap), top: RESTAURANT_LAYOUT.supportY, width, height: RESTAURANT_LAYOUT.supportHeight }));
}

function restaurantTitleLines(value) {
  const words = clean(value, 100).split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= 26 || !current) current = candidate;
    else if (lines.length === 0) { lines.push(current); current = word; }
    else current = candidate;
  }
  if (current) lines.push(current);
  if (lines.length <= 2) return lines;
  return [lines[0], clean(lines.slice(1).join(" "), 34)];
}

function restaurantTitleFontSize(lines) {
  const longest = Math.max(...lines.map(line => line.length), 1);
  const sizeForWidth = longest <= 21 ? 93 : Math.floor(972 / (longest * 0.54));
  // Short, normal names receive the requested ~60% increase (58px → 93px).
  // Two-line or unusually long names reduce only as far as required to fit.
  const maximum = lines.length > 1 ? 76 : 93;
  return Math.max(32, Math.min(maximum, sizeForWidth));
}

function restaurantDisplayTitle(title, type) {
  const text = clean(title, 100);
  const normalizedTitle = text.toLocaleLowerCase();
  const hasExplicitType = /\b(?:restaurant|taverna|tavern|beach bar|cocktail bar|bar)\b/i.test(normalizedTitle);
  return clean(hasExplicitType || !type ? text : `${text} ${type}`, 110);
}

function restaurantPosterSvg(poster, positions) {
  const layout = RESTAURANT_LAYOUT;
  const title = restaurantTitleLines(restaurantDisplayTitle(poster.title, poster.restaurantIdentity.type));
  const titleFontSize = restaurantTitleFontSize(title);
  const titleLineHeight = Math.round(titleFontSize * 1.05);
  const titleY = title.length > 1 ? 792 : layout.titleY;
  const titleSvg = title.map((line, index) => `<text x="${layout.titleX}" y="${titleY + index * titleLineHeight}" class="restaurantName" style="font-size:${titleFontSize}px">${escapeXml(line)}</text>`).join("");
  const lastTitleBaseline = titleY + (title.length - 1) * titleLineHeight;
  const metaY = lastTitleBaseline + Math.round(titleFontSize * (title.length > 1 ? 0.42 : 0.5));
  const cuisineAndType = [poster.restaurantIdentity.type, poster.restaurantIdentity.food].filter(Boolean).join(" · ");
  const detail = poster.location;
  const labelsSvg = positions.map((position, index) => poster.supportingLabels[index] ? `<g><rect x="${position.left}" y="${position.top + position.height - 62}" width="${position.width}" height="62" fill="url(#supportShade)"/><text x="${position.left + 18}" y="${position.top + position.height - 22}" class="supportLabel">${escapeXml(poster.supportingLabels[index])}</text></g>` : "").join("");
  return Buffer.from(`<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="restaurantShade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#071a33" stop-opacity="0"/><stop offset="1" stop-color="#071a33" stop-opacity=".42"/></linearGradient><linearGradient id="supportShade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#071a33" stop-opacity="0"/><stop offset="1" stop-color="#071a33" stop-opacity=".62"/></linearGradient></defs>
    <style>.restaurantName{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:58px;font-weight:800;letter-spacing:-1.1px;paint-order:stroke;stroke:#071a33;stroke-opacity:.26;stroke-width:3px}.restaurantMeta{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;paint-order:stroke;stroke:#071a33;stroke-opacity:.28;stroke-width:2px}.restaurantDetail{fill:#f3f8fa;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;paint-order:stroke;stroke:#071a33;stroke-opacity:.3;stroke-width:2px}.supportLabel{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;paint-order:stroke;stroke:#071a33;stroke-opacity:.4;stroke-width:2px}</style>
    <rect y="${layout.heroGradientY}" width="1080" height="${layout.heroHeight - layout.heroGradientY}" fill="url(#restaurantShade)"/>
    ${titleSvg}${cuisineAndType ? `<text x="${layout.titleX}" y="${metaY}" class="restaurantMeta">${escapeXml(cuisineAndType)}</text>` : ""}${detail ? `<text x="${layout.titleX}" y="${metaY + layout.detailGap}" class="restaurantDetail">${escapeXml(detail)}</text>` : ""}
    ${labelsSvg}
  </svg>`);
}

async function composeRestaurantImage({ hero, supporting = [], facts, language, copy, includeLogo, record, promotionalLocation }) {
  if (![2, 3].includes(supporting.length)) throw imageError("Restaurant posters require two or three supporting images.");
  const positions = restaurantPositions(supporting.length);
  const composites = [{ input: await toCardImage(hero, OUTPUT_WIDTH, RESTAURANT_LAYOUT.heroHeight), left: 0, top: 0 }];
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    composites.push({ input: await toCardImage(supporting[index], position.width, position.height), left: position.left, top: position.top });
  }
  const poster = posterData({ category: "restaurant", facts, language, copy, supportingCount: positions.length, record, promotionalLocation });
  composites.push({ input: restaurantPosterSvg(poster, positions), left: 0, top: 0 });
  if (includeLogo) {
    const logoPath = path.join(process.cwd(), "images", "logo.png");
    const logo = await sharp(logoPath).resize({ width: RESTAURANT_LAYOUT.logoWidth, height: RESTAURANT_LAYOUT.logoWidth, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    composites.push({ input: logo, left: RESTAURANT_LAYOUT.logoX, top: RESTAURANT_LAYOUT.logoY });
  }
  // The canvas is entirely covered by the hero and support row; no decorative
  // colour layer is introduced for the Restaurant/Taverna composition.
  return sharp({ create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3, background: "#000000" } }).composite(composites).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

function localBusinessPositions(count) {
  if (count === 2) {
    const width = Math.floor((OUTPUT_WIDTH - LOCAL_BUSINESS_LAYOUT.supportGap) / 2);
    return [{ left: 0, top: LOCAL_BUSINESS_LAYOUT.supportY, width, height: LOCAL_BUSINESS_LAYOUT.supportHeight }, { left: width + LOCAL_BUSINESS_LAYOUT.supportGap, top: LOCAL_BUSINESS_LAYOUT.supportY, width, height: LOCAL_BUSINESS_LAYOUT.supportHeight }];
  }
  const width = Math.floor((OUTPUT_WIDTH - LOCAL_BUSINESS_LAYOUT.supportGap * 2) / 3);
  return Array.from({ length: 3 }, (_, index) => ({ left: index * (width + LOCAL_BUSINESS_LAYOUT.supportGap), top: LOCAL_BUSINESS_LAYOUT.supportY, width, height: LOCAL_BUSINESS_LAYOUT.supportHeight }));
}

function localBusinessPosterSvg(poster, positions) {
  const layout = LOCAL_BUSINESS_LAYOUT;
  const title = restaurantTitleLines(poster.title);
  const titleFontSize = restaurantTitleFontSize(title);
  const titleLineHeight = Math.round(titleFontSize * 1.05);
  const titleY = title.length > 1 ? 792 : layout.titleY;
  const titleSvg = title.map((line, index) => `<text x="${layout.titleX}" y="${titleY + index * titleLineHeight}" class="businessName" style="font-size:${titleFontSize}px">${escapeXml(line)}</text>`).join("");
  const lastTitleBaseline = titleY + (title.length - 1) * titleLineHeight;
  const subtitleY = lastTitleBaseline + Math.round(titleFontSize * (title.length > 1 ? 0.42 : 0.5));
  const locationY = subtitleY + layout.detailGap;
  const labelsSvg = positions.map((position, index) => poster.supportingLabels[index] ? `<g><rect x="${position.left}" y="${position.top + position.height - 62}" width="${position.width}" height="62" fill="url(#businessSupportShade)"/><text x="${position.left + 18}" y="${position.top + position.height - 22}" class="businessSupportLabel">${escapeXml(poster.supportingLabels[index])}</text></g>` : "").join("");
  return Buffer.from(`<svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="businessShade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#071a33" stop-opacity="0"/><stop offset="1" stop-color="#071a33" stop-opacity=".42"/></linearGradient><linearGradient id="businessSupportShade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#071a33" stop-opacity="0"/><stop offset="1" stop-color="#071a33" stop-opacity=".62"/></linearGradient></defs>
    <style>.businessName{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:58px;font-weight:800;letter-spacing:-1.1px;paint-order:stroke;stroke:#071a33;stroke-opacity:.26;stroke-width:3px}.businessSubtitle{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;paint-order:stroke;stroke:#071a33;stroke-opacity:.28;stroke-width:2px}.businessLocation{fill:#f3f8fa;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;paint-order:stroke;stroke:#071a33;stroke-opacity:.3;stroke-width:2px}.businessSupportLabel{fill:#fff;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:800;paint-order:stroke;stroke:#071a33;stroke-opacity:.4;stroke-width:2px}</style>
    <rect y="${layout.heroGradientY}" width="1080" height="${layout.heroHeight - layout.heroGradientY}" fill="url(#businessShade)"/>
    ${titleSvg}${poster.localBusiness.subtitle ? `<text x="${layout.titleX}" y="${subtitleY}" class="businessSubtitle">${escapeXml(poster.localBusiness.subtitle)}</text>` : ""}${poster.location ? `<text x="${layout.titleX}" y="${locationY}" class="businessLocation">${escapeXml(poster.location)}</text>` : ""}
    ${labelsSvg}
  </svg>`);
}

async function composeLocalBusinessImage({ hero, supporting = [], facts, language, copy, includeLogo, record, localBusinessContext }) {
  if (![2, 3].includes(supporting.length)) throw imageError("Local Business posters require two or three supporting images.");
  const positions = localBusinessPositions(supporting.length);
  const composites = [{ input: await toCardImage(hero, OUTPUT_WIDTH, LOCAL_BUSINESS_LAYOUT.heroHeight), left: 0, top: 0 }];
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    composites.push({ input: await toCardImage(supporting[index], position.width, position.height), left: position.left, top: position.top });
  }
  const poster = posterData({ category: "local-business", facts, language, copy, supportingCount: positions.length, record, localBusinessContext });
  composites.push({ input: localBusinessPosterSvg(poster, positions), left: 0, top: 0 });
  if (includeLogo) {
    const logoPath = path.join(process.cwd(), "images", "logo.png");
    const logo = await sharp(logoPath).resize({ width: LOCAL_BUSINESS_LAYOUT.logoWidth, height: LOCAL_BUSINESS_LAYOUT.logoWidth, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    composites.push({ input: logo, left: LOCAL_BUSINESS_LAYOUT.logoX, top: LOCAL_BUSINESS_LAYOUT.logoY });
  }
  return sharp({ create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3, background: "#000000" } }).composite(composites).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

async function composeSocialImage({ hero, supporting = [], facts, category, language, copy, includeLogo, record, promotionalLocation = "", localBusinessContext = {} }) {
  if (category === "accommodation") return composeAccommodationImage({ hero, supporting, facts, language, copy, includeLogo, record });
  if (category === "beach") return composeBeachImage({ hero, supporting, facts, language, copy, includeLogo, record });
  if (category === "restaurant") return composeRestaurantImage({ hero, supporting, facts, language, copy, includeLogo, record, promotionalLocation });
  if (category === "local-business") return composeLocalBusinessImage({ hero, supporting, facts, language, copy, includeLogo, record, localBusinessContext });
  const positions = supportPositions(Math.min(supporting.length, 3));
  const composites = [{ input: await toCardImage(hero, OUTPUT_WIDTH, 718), left: 0, top: 98 }];
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    composites.push({ input: await toCardImage(supporting[index], position.width, position.height), left: position.left, top: position.top });
  }
  const poster = posterData({ category, facts, language, copy, supportingCount: positions.length, record });
  const overlay = posterSvg(poster, positions, includeLogo);
  if (includeLogo) {
    const logoPath = path.join(process.cwd(), "images", "logo.png");
    const logo = await sharp(logoPath).resize({ width: 72, height: 72, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    composites.push({ input: overlay, left: 0, top: 0 });
    composites.push({ input: logo, left: 32, top: 15 });
  } else composites.push({ input: overlay, left: 0, top: 0 });
  return sharp({ create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 3, background: "#071a33" } }).composite(composites).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

function boundedReference(input) {
  return sharp(input, { limitInputPixels: 25_000_000 }).rotate().resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

function enhancePrompt({ facts, language, angle }) {
  return ["Create a polished 4:5 editorial travel image using supplied canonical photos as strict references.", `Listing: \"${localizedTitle(facts, language)}\". Angle: \"${String(angle).slice(0, 40)}\".`, "Preserve the exact real property, landscape, architecture, beach, furnishings and distinctive visual details. Do not add, remove or invent buildings, rooms, pools, facilities, views, people, signs, logos, written words, prices, distances or claims. Do not create text or a logo. Leave the lower portion visually clean for deterministic poster overlays."].join(" ");
}

function safeOpenAIDiagnostic(response, payload, model) {
  const upstream = payload?.error || {};
  console.error("OpenAI image API error", { upstreamStatus: response.status, errorType: typeof upstream.type === "string" ? upstream.type.slice(0, 100) : undefined, errorCode: typeof upstream.code === "string" ? upstream.code.slice(0, 100) : undefined, errorMessage: typeof upstream.message === "string" ? upstream.message.slice(0, 300) : undefined, requestId: response.headers.get("x-request-id") || response.headers.get("request-id") || undefined, model });
}

async function createEnhancedBase({ hero, supporting, facts, language, angle, apiKey, model, quality, userId }) {
  if (!apiKey) throw imageError("The Studio image environment is not configured.", 503);
  const form = new FormData();
  form.append("model", model); form.append("prompt", enhancePrompt({ facts, language, angle })); form.append("size", "1088x1360"); form.append("quality", quality); form.append("output_format", "jpeg"); form.append("output_compression", "90"); form.append("n", "1");
  for (const [index, reference] of [hero, ...supporting.slice(0, 3)].entries()) {
    const normalized = await boundedReference(reference);
    form.append("image[]", new Blob([normalized], { type: "image/jpeg" }), `listing-reference-${index}.jpg`);
  }
  let response;
  try { response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "X-Client-Request-Id": crypto.createHash("sha256").update(String(userId)).digest("hex").slice(0, 32) }, body: form, signal: AbortSignal.timeout(110_000) }); }
  catch { throw imageError("The AI image service is temporarily unavailable.", 503); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) { safeOpenAIDiagnostic(response, payload, model); if (response.status === 429) throw imageError("The AI image service is temporarily unavailable. Please try again later.", 429); throw imageError("The AI image service could not create a visual. Please try again.", 502); }
  const encoded = payload?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || !encoded) { console.error("OpenAI image API returned no image", { requestId: response.headers.get("x-request-id") || response.headers.get("request-id") || undefined, model }); throw imageError("The AI image service returned an invalid visual. Please try again.", 502); }
  return Buffer.from(encoded, "base64");
}

module.exports = { OUTPUT_HEIGHT, OUTPUT_WIDTH, categoryFacts, composeSocialImage, createEnhancedBase, downloadCanonicalImage, imageError, posterData };
