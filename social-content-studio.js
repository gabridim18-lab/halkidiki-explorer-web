"use strict";

// This is the same public Supabase storage contract used by the existing
// admin dashboard. It contains no server credential.
const SUPABASE_URL = "https://bjywllpzvckllydflxbd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_2CYR00gmzcodRcOqbjIBIQ_X450DFQh";
const ADMIN_AUTH_STORAGE_KEY = "sb-bjywllpzvckllydflxbd-auth-token";
const DATA_ROOT = "https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data";
const CATEGORY_CONFIG = {
  accommodation: { index: `${DATA_ROOT}/accommodations/accommodations-index-v2.json` },
  beach: { index: `${DATA_ROOT}/beaches/beaches-index.json` },
  restaurant: { index: `${DATA_ROOT}/restaurants/restaurants-index.json` },
  "local-business": { index: `${DATA_ROOT}/local-businesses/local-businesses-index.json` },
  "what-to-do": { index: `${DATA_ROOT}/what-to-do/what-to-do-index.json` }
};

const studioForm = document.getElementById("studioForm");
const categorySelect = document.getElementById("category");
const listingSelect = document.getElementById("listingId");
const languageSelect = document.getElementById("language");
const platformSelect = document.getElementById("platform");
const authStatus = document.getElementById("authStatus");
const imagePicker = document.getElementById("imagePicker");
const imagePickerStatus = document.getElementById("imagePickerStatus");
const accommodationPromotion = document.getElementById("accommodationPromotion");
const promotionalPriceAmount = document.getElementById("promotionalPriceAmount");
const promotionalPriceCurrency = document.getElementById("promotionalPriceCurrency");
const promotionalPriceUnit = document.getElementById("promotionalPriceUnit");
const creativePackEmpty = document.getElementById("creativePackEmpty");
const creativePackContent = document.getElementById("creativePackContent");
const creativeProfileBadge = document.getElementById("creativeProfileBadge");
const packIdentity = document.getElementById("packIdentity");
const packImages = document.getElementById("packImages");
const packKeyFacts = document.getElementById("packKeyFacts");
const packKeyFactsTitle = document.getElementById("packKeyFactsTitle");
const compactPackSummary = document.getElementById("compactPackSummary");
const packShortDescription = document.getElementById("packShortDescription");
const packHashtags = document.getElementById("packHashtags");
const packPageOnePractical = document.getElementById("packPageOnePractical");
const packPageOnePracticalTitle = document.getElementById("packPageOnePracticalTitle");
const packPageOnePracticalFacts = document.getElementById("packPageOnePracticalFacts");
const packDescriptions = document.getElementById("packDescriptions");
const packPageTwoFactsSection = document.getElementById("packPageTwoFactsSection");
const packPracticalFacts = document.getElementById("packPracticalFacts");
const generateButton = document.getElementById("generateButton");
const formMessage = document.getElementById("formMessage");
const emptyPreview = document.getElementById("emptyPreview");
const visualPreview = document.getElementById("visualPreview");
const finalVisual = document.getElementById("finalVisual");
const downloadButton = document.getElementById("downloadButton");
const draftPreview = document.getElementById("draftPreview");

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: window.localStorage, storageKey: ADMIN_AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;

const listingCache = new Map();
let canonicalImages = [];
let heroImageId = "";
let supportingImageIds = new Set();
let creativePack = null;
let selectedFactIds = new Set();
let isGenerating = false;
let beachAssetsRequest = 0;

function setMessage(message = "", type = "") {
  formMessage.textContent = message;
  formMessage.className = type ? `form-message ${type}` : "form-message";
}

function listingName(item) {
  return item?.name && typeof item.name === "object"
    ? item.name.en || item.name.ro || item.name.el || item.id
    : item?.titleEn || item?.titleRo || item?.titleEl || item?.title || item?.name || item?.id || "Untitled listing";
}

function selectedAngle() { return studioForm.querySelector('input[name="angle"]:checked')?.value || ""; }
function selectedMode() { return document.querySelector('input[name="generationMode"]:checked')?.value || "safe"; }
function allCreativeFacts() { return creativePack?.factGroups?.flatMap(group => group.facts || []) || []; }
function selectedCreativeFacts() {
  const facts = allCreativeFacts().filter(fact => selectedFactIds.has(fact.id));
  const promotion = manualPromotionFact();
  if (promotion) facts.push(promotion);
  return facts.sort((left, right) => right.priority - left.priority);
}

function manualPromotion() {
  if (categorySelect.value !== "accommodation") return null;
  const amount = Number(promotionalPriceAmount.value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return null;
  const currency = promotionalPriceCurrency.value;
  const unit = promotionalPriceUnit.value;
  if (!["EUR", "RON", "USD", "GBP"].includes(currency) || !["night", "stay", "person"].includes(unit)) return null;
  return { amount, currency, unit };
}

function manualPromotionFact() {
  const promotion = manualPromotion();
  if (!promotion) return null;
  const symbol = { EUR: "€", RON: "RON ", USD: "$", GBP: "£" }[promotion.currency];
  return { id: "manual-promotional-price", group: "stay", label: "Promotional price from", value: `From ${symbol}${promotion.amount} / ${promotion.unit}`, priority: 101, isManual: true };
}

const BEACH_FACT_PRIORITY = ["family-friendly", "water-entry", "water-depth", "beach-type", "sand", "blue-flag", "water-clarity", "occupancy", "recommendation-rating"];
const BEACH_PRACTICAL_PRIORITY = ["sunbeds", "toilets", "parking-available", "accessible", "activities", "ideal-for", "highlights", "parking-difficulty"];
const ACCOMMODATION_PRIMARY_ORDER = ["guests", "bedrooms", "beach-distance"];
const ACCOMMODATION_FALLBACK_ORDER = ["bathrooms", "wifi", "air-conditioning", "parking", "kitchen", "balcony", "view", "size"];

function factsById(facts) { return new Map(facts.map(fact => [fact.id, fact])); }
function selectedBeachPrimaryFacts(facts = selectedCreativeFacts()) { const byId = factsById(facts); return BEACH_FACT_PRIORITY.map(id => byId.get(id)).filter(Boolean).slice(0, 6); }
function selectedBeachPracticalFacts(facts = selectedCreativeFacts()) { const byId = factsById(facts); return BEACH_PRACTICAL_PRIORITY.map(id => byId.get(id)).filter(Boolean).slice(0, 6); }
function defaultBeachFactIds(facts = allCreativeFacts()) { return new Set([...selectedBeachPrimaryFacts(facts), ...selectedBeachPracticalFacts(facts)].map(fact => fact.id)); }
function accommodationPrimaryFacts(facts = selectedCreativeFacts()) {
  const byId = factsById(facts);
  const primary = ACCOMMODATION_PRIMARY_ORDER.map(id => byId.get(id)).filter(Boolean);
  const pool = byId.get("pool");
  if (pool) primary.push(pool);
  else {
    const fallback = ACCOMMODATION_FALLBACK_ORDER.map(id => byId.get(id)).find(Boolean);
    if (fallback) primary.push(fallback);
  }
  return primary.slice(0, 4);
}

function populateListings(listings) {
  listingSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a listing";
  listingSelect.appendChild(placeholder);
  listings.forEach(item => {
    if (typeof item?.id !== "string") return;
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = listingName(item);
    listingSelect.appendChild(option);
  });
  listingSelect.disabled = false;
}

function resetCreativePack() {
  creativePack = null;
  selectedFactIds = new Set();
  renderCreativePack();
}

function resetListingDependentState() {
  canonicalImages = [];
  heroImageId = "";
  supportingImageIds = new Set();
  promotionalPriceAmount.value = "";
  ["hook", "caption", "cta", "hashtags"].forEach(id => { document.getElementById(id).value = ""; });
  finalVisual.removeAttribute("src");
  downloadButton.href = "#";
  visualPreview.hidden = true;
  draftPreview.hidden = true;
  emptyPreview.hidden = true;
  accommodationPromotion.hidden = categorySelect.value !== "accommodation";
  resetCreativePack();
}

function resetImagePicker(message = "Select a listing to load published photos.") {
  canonicalImages = [];
  heroImageId = "";
  supportingImageIds = new Set();
  imagePicker.replaceChildren();
  const note = document.createElement("p");
  note.className = "picker-empty";
  note.textContent = message;
  imagePicker.appendChild(note);
  imagePickerStatus.textContent = "No photos selected";
}

async function loadListings(category) {
  const config = CATEGORY_CONFIG[category];
  if (!config) return setMessage("This category is not available.", "error");
  resetImagePicker();
  listingSelect.disabled = true;
  listingSelect.replaceChildren();
  const loadingOption = document.createElement("option");
  loadingOption.textContent = "Loading listings…";
  listingSelect.appendChild(loadingOption);
  setMessage("");
  try {
    let listings = listingCache.get(category);
    if (!listings) {
      const response = await fetch(config.index, { cache: "no-store" });
      if (!response.ok) throw new Error("The listings index could not be loaded.");
      const payload = await response.json();
      listings = Array.isArray(payload) ? payload : [];
      listings.sort((left, right) => listingName(left).localeCompare(listingName(right), undefined, { sensitivity: "base" }));
      listingCache.set(category, listings);
    }
    populateListings(listings);
    if (!listings.length) setMessage("No listings are available in this category yet.", "error");
  } catch (error) {
    console.error("Listing index error", error);
    listingSelect.replaceChildren();
    const option = document.createElement("option");
    option.textContent = "Listings unavailable";
    listingSelect.appendChild(option);
    setMessage("The listing index is unavailable. Please try again.", "error");
  }
}

async function getAccessToken() {
  if (!supabaseClient) throw new Error("The authentication library could not be loaded.");
  const { data: { session }, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("Please sign in through the Halkidiki Explorer admin dashboard first.");
  return session.access_token;
}

async function updateAuthStatus() {
  if (!supabaseClient) { authStatus.textContent = "Authentication unavailable"; return; }
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    authStatus.textContent = session?.access_token ? "🔒 Admin session detected" : "🔒 Sign in through Admin first";
  } catch (error) {
    console.error("Studio session check failed", error);
    authStatus.textContent = "Authentication unavailable";
  }
}

function renderImagePicker() {
  imagePicker.replaceChildren();
  if (!canonicalImages.length) return resetImagePicker("No published listing photos are available.");
  canonicalImages.forEach((image, index) => {
    const card = document.createElement("article");
    card.className = "image-choice";
    if (image.id === heroImageId) card.classList.add("selected-hero");
    if (supportingImageIds.has(image.id)) card.classList.add("selected-support");
    const photo = document.createElement("img");
    photo.src = image.url;
    photo.alt = image.alt || `Published listing image ${index + 1}`;
    photo.loading = "lazy";
    const controls = document.createElement("div");
    controls.className = "choice-overlay";
    if (image.id === heroImageId) { const badge = document.createElement("span"); badge.className = "choice-role"; badge.textContent = "Hero"; controls.appendChild(badge); }
    if (supportingImageIds.has(image.id)) { const badge = document.createElement("span"); badge.className = "choice-role"; badge.textContent = "Supporting"; controls.appendChild(badge); }
    const heroButton = document.createElement("button");
    heroButton.type = "button";
    heroButton.textContent = image.id === heroImageId ? "Hero ✓" : "Set hero";
    heroButton.addEventListener("click", event => {
      event.stopPropagation();
      heroImageId = image.id;
      supportingImageIds.delete(image.id);
      renderImagePicker();
      renderCreativePack();
    });
    card.addEventListener("click", () => {
      const maximumSupporting = categorySelect.value === "beach" ? 2 : 3;
      if (image.id === heroImageId) return;
      if (supportingImageIds.has(image.id)) supportingImageIds.delete(image.id);
      else if (supportingImageIds.size < maximumSupporting) supportingImageIds.add(image.id);
      else { setMessage(`You can choose up to ${maximumSupporting} supporting images.`, "error"); return; }
      renderImagePicker();
      renderCreativePack();
    });
    card.append(photo, controls, heroButton);
    imagePicker.appendChild(card);
  });
  imagePickerStatus.textContent = heroImageId ? `Hero + ${supportingImageIds.size} supporting` : "Choose a hero image";
}

function selectedPackImages() {
  const byId = new Map(canonicalImages.map(image => [image.id, image]));
  return [heroImageId, ...supportingImageIds].map(id => byId.get(id)).filter(Boolean);
}

function packFactElement(fact) {
  const card = document.createElement("div");
  card.className = "pack-fact";
  const label = document.createElement("strong");
  label.textContent = fact.label;
  const value = document.createElement("span");
  value.textContent = fact.value;
  card.append(label, value);
  return card;
}

function beachCompactFactText(fact) {
  const available = { sunbeds: "Sunbeds", toilets: "Toilets", "parking-available": "Parking", accessible: "Accessible", "family-friendly": "Kids friendly", "blue-flag": "Blue Flag", sunset: "Sunset view" };
  return available[fact.id] || fact.value;
}

function compactFactElement(fact) {
  const item = document.createElement("div");
  item.className = "compact-fact";
  item.textContent = beachCompactFactText(fact);
  return item;
}

function renderDescription(target, value, heading) {
  target.replaceChildren();
  if (!value) return;
  const block = document.createElement("article");
  block.className = "pack-description";
  const title = document.createElement("h3");
  title.textContent = heading;
  const copy = document.createElement("div");
  copy.textContent = value;
  block.append(title, copy);
  target.appendChild(block);
}

function canonicalCaptionText() {
  const profileId = creativePack?.profile?.id;
  if (!['accommodation', 'beach'].includes(profileId)) return "";
  const description = typeof creativePack?.descriptions?.short === "string"
    ? creativePack.descriptions.short.replace(/\s+/g, " ").trim()
    : "";
  const hashtags = Array.isArray(creativePack?.descriptions?.hashtags)
    ? creativePack.descriptions.hashtags.filter(tag => typeof tag === "string" && tag.trim()).slice(0, 5)
    : [];
  if (!description || hashtags.length !== 5 || !hashtags.includes("#HalkidikiExplorer")) return "";
  return `${description}\n\n${hashtags.join(" ")}`;
}

function refreshCanonicalCaption() {
  const caption = document.getElementById("caption");
  caption.value = canonicalCaptionText();
}

function renderCreativePack() {
  if (!creativePack) {
    creativePackEmpty.hidden = false;
    creativePackContent.hidden = true;
    [packIdentity, packImages, packKeyFacts, packPageOnePracticalFacts, packPracticalFacts, packDescriptions, packHashtags].forEach(element => element.replaceChildren());
    packShortDescription.textContent = "";
    compactPackSummary.hidden = true;
    return;
  }
  creativePackEmpty.hidden = true;
  creativePackContent.hidden = false;
  creativeProfileBadge.textContent = creativePack.profile.displayName;
  const profileId = creativePack.profile.id;
  const accommodation = profileId === "accommodation";
  const beach = profileId === "beach";
  // The Page 1 brief is canonical-only. A manual poster-price override stays
  // available to the poster request, but is never presented as listing data.
  const facts = selectedCreativeFacts().filter(fact => !fact.isManual);
  const selectedImages = selectedPackImages();

  packIdentity.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = creativePack.identity.title;
  const meta = document.createElement("p");
  meta.textContent = [creativePack.identity.category, creativePack.identity.location].filter(Boolean).join(" · ");
  packIdentity.append(title, meta);

  packImages.replaceChildren();
  selectedImages.forEach((image, index) => {
    const card = document.createElement("div");
    card.className = "pack-image";
    const photo = document.createElement("img");
    photo.src = image.url;
    photo.alt = index === 0 ? "Hero image" : `Supporting image ${index}`;
    card.appendChild(photo);
    packImages.appendChild(card);
  });
  if (!packImages.childElementCount) {
    const note = document.createElement("p");
    note.className = "picker-empty";
    note.textContent = "Choose published photos to include them in the visual brief.";
    packImages.appendChild(note);
  }

  packKeyFacts.replaceChildren();
  packPageOnePracticalFacts.replaceChildren();
  packPracticalFacts.replaceChildren();
  let primary = [];
  let pageOneSecondary = [];
  let pageTwoSecondary = [];
  if (accommodation) {
    primary = accommodationPrimaryFacts(facts);
    const primaryIds = new Set(primary.map(fact => fact.id));
    pageOneSecondary = facts.filter(fact => !primaryIds.has(fact.id) && fact.group !== "identity");
    packKeyFactsTitle.textContent = "Primary facts";
  } else if (beach) {
    primary = selectedBeachPrimaryFacts(facts);
    pageOneSecondary = selectedBeachPracticalFacts(facts);
    packKeyFactsTitle.textContent = "Key facts";
  } else {
    const restaurantFamily = categorySelect.value === "restaurant";
    const practicalGroups = new Set(["practical", ...(categorySelect.value === "local-business" ? [] : ["service"])]);
    const secondaryIds = new Set(["features", "price", "sunbed-price", "hours"]);
    primary = facts.filter(fact => !practicalGroups.has(fact.group) && !(restaurantFamily && secondaryIds.has(fact.id)) && fact.group !== "identity");
    pageTwoSecondary = facts.filter(fact => !primary.includes(fact) && fact.group !== "identity");
    packKeyFactsTitle.textContent = "Key facts";
  }
  primary.forEach(fact => packKeyFacts.appendChild((beach || accommodation) ? compactFactElement(fact) : packFactElement(fact)));
  if (!packKeyFacts.childElementCount) packKeyFacts.textContent = "No primary verified facts are available.";

  const showSummary = accommodation || beach;
  compactPackSummary.hidden = !showSummary;
  packShortDescription.textContent = showSummary ? creativePack.descriptions.short || "" : "";
  packHashtags.replaceChildren();
  const tags = Array.isArray(creativePack.descriptions.hashtags) ? creativePack.descriptions.hashtags : [];
  if (showSummary && tags.length) tags.forEach(tag => { const item = document.createElement("span"); item.textContent = tag; packHashtags.appendChild(item); });
  const profileUsesPageOnePractical = accommodation || beach;
  packPageOnePractical.hidden = !(profileUsesPageOnePractical && pageOneSecondary.length);
  if (profileUsesPageOnePractical) {
    packPageOnePracticalTitle.textContent = "Local & practical information";
    pageOneSecondary.forEach(fact => packPageOnePracticalFacts.appendChild(accommodation ? packFactElement(fact) : compactFactElement(fact)));
  }
  packPageTwoFactsSection.hidden = profileUsesPageOnePractical;
  if (!profileUsesPageOnePractical) {
    pageTwoSecondary.forEach(fact => packPracticalFacts.appendChild(packFactElement(fact)));
    if (!packPracticalFacts.childElementCount) packPracticalFacts.textContent = "No secondary verified facts are available.";
  }

  renderDescription(packDescriptions, creativePack.descriptions.long, "Canonical description");
  if (!packDescriptions.childElementCount) packDescriptions.textContent = "No extended canonical description is available.";
}

async function loadCanonicalImages() {
  const listingId = listingSelect.value;
  const category = categorySelect.value;
  const language = languageSelect.value;
  const beachRequestId = category === "beach" ? ++beachAssetsRequest : 0;
  if (!listingId) return resetImagePicker();
  resetListingDependentState();
  resetImagePicker("Loading published listing photos…");
  imagePickerStatus.textContent = "Loading…";
  try {
    const accessToken = await getAccessToken();
    const response = await fetch("/api/social/listing-assets", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ category, listingId, language }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The listing photos could not be loaded.");
    if ((category === "beach" && (beachRequestId !== beachAssetsRequest || languageSelect.value !== language)) || listingSelect.value !== listingId || categorySelect.value !== category) return;
    canonicalImages = Array.isArray(result.images) ? result.images : [];
    heroImageId = canonicalImages[0]?.id || "";
    supportingImageIds = category === "beach" ? new Set(canonicalImages.slice(1, 3).map(image => image.id)) : new Set();
    creativePack = result.creativePack || null;
    selectedFactIds = creativePack?.profile?.id === "beach"
      ? defaultBeachFactIds()
      : new Set(allCreativeFacts().filter(fact => !(category === "restaurant" && ["hours", "features", "price", "sunbed-price"].includes(fact.id))).map(fact => fact.id));
    accommodationPromotion.hidden = category !== "accommodation";
    renderImagePicker();
    renderCreativePack();
    refreshCanonicalCaption();
  } catch (error) {
    if (category === "beach" && beachRequestId !== beachAssetsRequest) return;
    console.error("Listing assets error", error);
    resetImagePicker(error.message || "The listing photos could not be loaded.");
    setMessage(error.message || "The listing photos could not be loaded.", "error");
  }
}

function setBusy(busy, label = "Generating social image…") {
  isGenerating = busy;
  generateButton.disabled = busy;
  generateButton.textContent = busy ? label : "✦ Generate social image";
}

function renderDraft(draft) {
  document.getElementById("hook").value = draft.hook || "";
  document.getElementById("caption").value = canonicalCaptionText() || draft.caption || "";
  document.getElementById("cta").value = draft.cta || "";
  document.getElementById("hashtags").value = Array.isArray(draft.hashtags) ? draft.hashtags.join(" ") : "";
  draftPreview.hidden = false;
}

function imagePayload() {
  return {
    category: categorySelect.value,
    listingId: listingSelect.value,
    language: languageSelect.value,
    platform: platformSelect.value,
    angle: selectedAngle(),
    mode: selectedMode(),
    heroImageId,
    supportingImageIds: [...supportingImageIds],
    manualPromotion: manualPromotion(),
    includeLogo: true
  };
}

async function generateImage() {
  if (isGenerating) return;
  const payload = imagePayload();
  if (!payload.listingId || !payload.angle || !payload.heroImageId) return setMessage("Choose a listing, content angle, and hero image before generating.", "error");
  const enhanced = payload.mode === "enhanced";
  setBusy(true, enhanced ? "Creating AI enhanced visual…" : "Building safe branded layout…");
  setMessage(enhanced ? "Creating the AI enhanced visual from canonical photo references…" : "Building the visual from unchanged canonical photos…");
  try {
    const accessToken = await getAccessToken();
    const response = await fetch("/api/social/generate-image", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The social visual could not be created.");
    const image = result.image || {};
    if (typeof image.dataUrl !== "string" || !image.dataUrl.startsWith("data:image/")) throw new Error("The social visual response was invalid.");
    finalVisual.src = image.dataUrl;
    downloadButton.href = image.dataUrl;
    downloadButton.download = image.fileName || "halkidiki-explorer-social.jpg";
    emptyPreview.hidden = true;
    visualPreview.hidden = false;
    renderDraft(result.draft || {});
    setMessage(enhanced ? "AI enhanced visual created. Review the real property before publishing." : "Safe branded layout created from unchanged published photos.");
    visualPreview.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error("Generate image error", error);
    setMessage(error.message || "The social visual could not be created.", "error");
  } finally {
    setBusy(false);
  }
}

async function copyText(value, button, success = "Copied") {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    const original = button.textContent;
    button.textContent = success;
    window.setTimeout(() => { button.textContent = original; }, 1400);
  } catch (error) {
    console.error("Copy failed", error);
    setMessage("Copy is unavailable. Select the text and copy it manually.", "error");
  }
}

function creativeBrief() {
  if (!creativePack) return "";
  const lines = ["VERIFIED SOCIAL VISUAL BRIEF", "", "LISTING", creativePack.identity.title, "", "CATEGORY", creativePack.identity.category];
  if (creativePack.identity.location) lines.push("", "LOCATION", creativePack.identity.location);
  const facts = selectedCreativeFacts();
  if (facts.length) lines.push("", "VERIFIED FACTS", ...facts.map(fact => `- ${fact.label}: ${fact.value}`));
  if (creativePack.descriptions.short) lines.push("", "CANONICAL SHORT DESCRIPTION", creativePack.descriptions.short);
  if (Array.isArray(creativePack.descriptions.hashtags) && creativePack.descriptions.hashtags.length) lines.push("", "HASHTAGS", creativePack.descriptions.hashtags.join(" "));
  const images = selectedPackImages();
  if (images.length) lines.push("", "SELECTED REFERENCE IMAGES", "Hero image", ...images.slice(1).map((image, index) => `Supporting image ${index + 1}`));
  lines.push("", "Use only the verified information above. Do not invent facilities, prices, distances, services, views, or other details not provided.");
  return lines.join("\n");
}

categorySelect.addEventListener("change", () => { resetListingDependentState(); loadListings(categorySelect.value); });
listingSelect.addEventListener("change", loadCanonicalImages);
languageSelect.addEventListener("change", () => { if (listingSelect.value) loadCanonicalImages(); });
studioForm.addEventListener("submit", event => { event.preventDefault(); generateImage(); });
document.querySelectorAll(".copy-button[data-copy]").forEach(button => button.addEventListener("click", () => { const field = document.getElementById(button.dataset.copy); if (field) copyText(field.value, button); }));
document.getElementById("regenerateButton").addEventListener("click", generateImage);
document.getElementById("changePhotosButton").addEventListener("click", () => document.getElementById("imagePickerSection").scrollIntoView({ behavior: "smooth", block: "center" }));
promotionalPriceAmount.addEventListener("input", renderCreativePack);
promotionalPriceCurrency.addEventListener("change", renderCreativePack);
promotionalPriceUnit.addEventListener("change", renderCreativePack);
document.getElementById("copyAllFactsButton").addEventListener("click", event => copyText(selectedCreativeFacts().map(fact => `${fact.label}: ${fact.value}`).join("\n"), event.currentTarget));
document.getElementById("copyShortDescriptionButton").addEventListener("click", event => copyText(creativePack?.descriptions?.short || "", event.currentTarget));
document.getElementById("copyHashtagsButton").addEventListener("click", event => copyText((creativePack?.descriptions?.hashtags || []).join(" "), event.currentTarget));
document.getElementById("copyLongDescriptionButton").addEventListener("click", event => copyText(creativePack?.descriptions?.long || "", event.currentTarget));
document.getElementById("copyAiBriefButton").addEventListener("click", event => copyText(creativeBrief(), event.currentTarget, "Visual brief copied"));

Promise.all([loadListings(categorySelect.value), updateAuthStatus()]);
