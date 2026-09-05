"use strict";

// Same public Supabase project configuration and storage contract as the
// existing admin dashboard. This is not an OpenAI credential.
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
const generateButton = document.getElementById("generateButton");
const suggestTextButton = document.getElementById("suggestTextButton");
const formMessage = document.getElementById("formMessage");
const authStatus = document.getElementById("authStatus");
const imagePicker = document.getElementById("imagePicker");
const imagePickerStatus = document.getElementById("imagePickerStatus");
const textOnImage = document.getElementById("textOnImage");
const textOnImageSubheadline = document.getElementById("textOnImageSubheadline");
const includeLogo = document.getElementById("includeLogo");
const emptyPreview = document.getElementById("emptyPreview");
const visualPreview = document.getElementById("visualPreview");
const finalVisual = document.getElementById("finalVisual");
const downloadButton = document.getElementById("downloadButton");
const draftPreview = document.getElementById("draftPreview");
const creativeSelection = document.getElementById("creativeSelection");
const creativeFactPicker = document.getElementById("creativeFactPicker");
const creativeFactStatus = document.getElementById("creativeFactStatus");
const creativePackPreview = document.getElementById("creativePackPreview");
const creativePackEmpty = document.getElementById("creativePackEmpty");
const creativePackContent = document.getElementById("creativePackContent");
const creativeProfileBadge = document.getElementById("creativeProfileBadge");
const packIdentity = document.getElementById("packIdentity");
const packImages = document.getElementById("packImages");
const packKeyFacts = document.getElementById("packKeyFacts");
const packPracticalFacts = document.getElementById("packPracticalFacts");
const packDescriptions = document.getElementById("packDescriptions");
const includeShortDescription = document.getElementById("includeShortDescription");
const includeLongDescription = document.getElementById("includeLongDescription");
const supportingLabelEditor = document.getElementById("supportingLabelEditor");
const supportingLabelFields = document.getElementById("supportingLabelFields");
const accommodationPromotion = document.getElementById("accommodationPromotion");
const promotionalPriceAmount = document.getElementById("promotionalPriceAmount");
const promotionalPriceCurrency = document.getElementById("promotionalPriceCurrency");
const promotionalPriceUnit = document.getElementById("promotionalPriceUnit");
const metaSetupNotice = document.getElementById("metaSetupNotice");
const facebookAccountName = document.getElementById("facebookAccountName");
const facebookConnectionStatus = document.getElementById("facebookConnectionStatus");
const connectFacebookButton = document.getElementById("connectFacebookButton");
const instagramAccountName = document.getElementById("instagramAccountName");
const instagramConnectionStatus = document.getElementById("instagramConnectionStatus");
const connectInstagramButton = document.getElementById("connectInstagramButton");

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: window.localStorage, storageKey: ADMIN_AUTH_STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
const listingCache = new Map();
let canonicalImages = [];
let heroImageId = "";
let supportingImageIds = new Set();
let isGenerating = false;
let activeWorkflow = "poster";
let creativePack = null;
let selectedFactIds = new Set();
let supportingImageLabels = new Map();

function setMessage(message = "", type = "") { formMessage.textContent = message; formMessage.className = type ? `form-message ${type}` : "form-message"; }
function listingName(item) { return item?.name && typeof item.name === "object" ? item.name.en || item.name.ro || item.name.el || item.id : item?.titleEn || item?.titleRo || item?.titleEl || item?.title || item?.name || item?.id || "Untitled listing"; }
function selectedAngle() { return studioForm.querySelector('input[name="angle"]:checked')?.value || ""; }
function selectedMode() { return studioForm.querySelector('input[name="generationMode"]:checked')?.value || "safe"; }
function allCreativeFacts() { return creativePack?.factGroups?.flatMap(group => group.facts || []) || []; }
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

function isAccommodationPrimaryFact(fact) {
  return categorySelect.value === "accommodation" && ["manual-promotional-price", "price", "guests", "bedrooms", "beach-distance", "pool"].includes(fact.id);
}

const BEACH_FACT_PRIORITY = ["family-friendly", "water-entry", "water-depth", "beach-type", "sand", "blue-flag", "water-clarity", "sunbeds", "accessible", "parking-available", "activities"];
function selectedBeachPrimaryFacts(facts = allCreativeFacts()) {
  const byId = new Map(facts.map(fact => [fact.id, fact]));
  return BEACH_FACT_PRIORITY.map(id => byId.get(id)).filter(Boolean).slice(0, 4);
}
function isBeachPrimaryFact(fact) {
  return categorySelect.value === "beach" && selectedBeachPrimaryFacts().some(primary => primary.id === fact.id);
}

function selectedCreativeFacts() {
  const facts = allCreativeFacts().filter(fact => selectedFactIds.has(fact.id));
  const promotion = manualPromotionFact();
  if (promotion) facts.push(promotion);
  return facts.sort((a, b) => Number(isAccommodationPrimaryFact(b) || isBeachPrimaryFact(b)) - Number(isAccommodationPrimaryFact(a) || isBeachPrimaryFact(a)) || b.priority - a.priority);
}

function populateListings(listings) {
  listingSelect.replaceChildren();
  const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = "Select a listing"; listingSelect.appendChild(placeholder);
  listings.forEach(item => { if (typeof item?.id === "string") { const option = document.createElement("option"); option.value = item.id; option.textContent = listingName(item); listingSelect.appendChild(option); } });
  listingSelect.disabled = false;
}

function resetCreativePack() {
  creativePack = null; selectedFactIds = new Set(); creativeFactPicker.replaceChildren(); creativeFactStatus.textContent = "Select a listing"; renderCreativePack();
}

function resetListingDependentState() {
  canonicalImages = []; heroImageId = ""; supportingImageIds = new Set(); supportingImageLabels = new Map();
  [textOnImage, textOnImageSubheadline, promotionalPriceAmount].forEach(field => { field.value = ""; });
  ["hook", "caption", "cta", "hashtags"].forEach(id => { document.getElementById(id).value = ""; });
  finalVisual.removeAttribute("src"); downloadButton.href = "#"; visualPreview.hidden = true; draftPreview.hidden = true; emptyPreview.hidden = activeWorkflow !== "poster";
  supportingLabelFields.replaceChildren(); supportingLabelEditor.hidden = true; accommodationPromotion.hidden = categorySelect.value !== "accommodation";
  resetCreativePack();
}

function resetImagePicker(message = "Select a listing to load published photos.") {
  canonicalImages = []; heroImageId = ""; supportingImageIds = new Set(); supportingImageLabels = new Map(); imagePicker.replaceChildren();
  const note = document.createElement("p"); note.className = "picker-empty"; note.textContent = message; imagePicker.appendChild(note);
  imagePickerStatus.textContent = "No photos selected";
}

async function loadListings(category) {
  const config = CATEGORY_CONFIG[category];
  if (!config) return setMessage("This category is not available.", "error");
  resetImagePicker(); listingSelect.disabled = true; listingSelect.replaceChildren();
  const loadingOption = document.createElement("option"); loadingOption.textContent = "Loading listings…"; listingSelect.appendChild(loadingOption); setMessage("");
  try {
    let listings = listingCache.get(category);
    if (!listings) { const response = await fetch(config.index, { cache: "no-store" }); if (!response.ok) throw new Error("The listings index could not be loaded."); const payload = await response.json(); listings = Array.isArray(payload) ? payload : []; listings.sort((a, b) => listingName(a).localeCompare(listingName(b), undefined, { sensitivity: "base" })); listingCache.set(category, listings); }
    populateListings(listings); if (!listings.length) setMessage("No listings are available in this category yet.", "error");
  } catch (error) { console.error("Listing index error", error); listingSelect.replaceChildren(); const option = document.createElement("option"); option.textContent = "Listings unavailable"; listingSelect.appendChild(option); setMessage("The listing index is unavailable. Please try again.", "error"); }
}

async function getAccessToken() {
  if (!supabaseClient) throw new Error("The authentication library could not be loaded.");
  const { data: { session }, error } = await supabaseClient.auth.getSession(); if (error) throw error;
  if (!session?.access_token) throw new Error("Please sign in through the Halkidiki Explorer admin dashboard first.");
  return session.access_token;
}

async function updateAuthStatus() {
  if (!supabaseClient) { authStatus.textContent = "Authentication unavailable"; return; }
  try { const { data: { session }, error } = await supabaseClient.auth.getSession(); if (error) throw error; authStatus.textContent = session?.access_token ? "🔒 Admin session detected" : "🔒 Sign in through Admin first"; } catch (error) { console.error("Studio session check failed", error); authStatus.textContent = "Authentication unavailable"; }
}

function platformElements(platform) {
  return platform === "facebook"
    ? { account: facebookAccountName, status: facebookConnectionStatus, button: connectFacebookButton, name: "Facebook" }
    : { account: instagramAccountName, status: instagramConnectionStatus, button: connectInstagramButton, name: "Instagram" };
}

function setPlatformConnection(platform, details = {}) {
  const elements = platformElements(platform);
  const connected = details.connected === true;
  const state = connected ? "connected" : details.state === "connecting" ? "connecting" : details.state === "error" ? "error" : "not-connected";
  const statusText = state === "connected" ? "Connected" : state === "connecting" ? "Connecting…" : state === "error" && details.message ? details.message : state === "error" ? "Connection error" : "Not connected";
  const accountName = platform === "facebook" ? details.name : details.username ? `@${String(details.username).replace(/^@/, "")}` : "";
  elements.account.textContent = accountName || (platform === "facebook" ? "No Page connected" : "No professional account connected");
  elements.status.className = `connection-status ${state}`;
  elements.status.replaceChildren();
  const icon = document.createElement("span"); icon.setAttribute("aria-hidden", "true"); icon.textContent = state === "connected" ? "●" : state === "error" ? "⚠" : state === "connecting" ? "◌" : "○";
  elements.status.append(icon, document.createTextNode(` ${statusText}`));
  elements.button.disabled = state === "connecting";
  elements.button.querySelector("span:last-child").textContent = state === "connected" ? `${elements.name} connected ✓` : state === "connecting" ? `Connecting ${elements.name}…` : `Connect ${elements.name}`;
  elements.status.removeAttribute("title");
}

function metaResultNotice() {
  const result = new URLSearchParams(window.location.search).get("meta");
  const messages = {
    connected: "Meta account setup completed. Account status has been refreshed.",
    cancelled: "Meta account connection was cancelled.",
    invalid_state: "Meta connection could not be verified. Start the connection again from the Studio.",
    error: "Meta account setup could not be completed. Please try again."
  };
  if (!messages[result]) return "";
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
  return messages[result];
}

async function loadMetaStatus() {
  setPlatformConnection("facebook", { state: "connecting" });
  setPlatformConnection("instagram", { state: "connecting" });
  const callbackNotice = metaResultNotice();
  try {
    const accessToken = await getAccessToken();
    const response = await fetch("/api/social/meta/status", { headers: { Authorization: `Bearer ${accessToken}` }, credentials: "same-origin" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Meta account status is unavailable.");
    setPlatformConnection("facebook", result.facebook || {});
    setPlatformConnection("instagram", result.instagram || {});
    const connectionMessage = [result.facebook, result.instagram].find(platform => platform?.message && !["Connected", "Not connected"].includes(platform.message))?.message;
    metaSetupNotice.textContent = callbackNotice || connectionMessage || (result.configured ? "Account setup is ready. Publishing is not enabled in this phase." : "Meta account setup needs server configuration before an account can be connected.");
  } catch (error) {
    setPlatformConnection("facebook", { state: "error", message: "Sign in is required to inspect Meta account status." });
    setPlatformConnection("instagram", { state: "error", message: "Sign in is required to inspect Meta account status." });
    metaSetupNotice.textContent = callbackNotice || "Sign in as a Studio administrator to inspect Meta account status.";
  }
}

async function connectMeta(platform) {
  const elements = platformElements(platform);
  setPlatformConnection(platform, { state: "connecting" });
  metaSetupNotice.textContent = `Opening ${elements.name} account setup…`;
  try {
    const accessToken = await getAccessToken();
    const response = await fetch("/api/social/meta/connect", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, credentials: "same-origin" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.authorizationUrl !== "string") throw new Error(result.error || "Meta account setup could not be started.");
    // The URL is server-generated and carries only OAuth state, never a token.
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    setPlatformConnection(platform, { state: "error", message: "Meta account setup could not be started." });
    metaSetupNotice.textContent = error.message || "Meta account setup could not be started.";
  }
}

function renderImagePicker() {
  imagePicker.replaceChildren();
  if (!canonicalImages.length) return resetImagePicker("No published listing photos are available.");
  canonicalImages.forEach((image, index) => {
    const card = document.createElement("article"); card.className = "image-choice";
    if (image.id === heroImageId) card.classList.add("selected-hero"); if (supportingImageIds.has(image.id)) card.classList.add("selected-support");
    const photo = document.createElement("img"); photo.src = image.url; photo.alt = image.alt || `Published listing image ${index + 1}`; photo.loading = "lazy";
    const controls = document.createElement("div"); controls.className = "choice-overlay";
    if (image.id === heroImageId) { const badge = document.createElement("span"); badge.className = "choice-role"; badge.textContent = "Hero"; controls.appendChild(badge); }
    if (supportingImageIds.has(image.id)) { const badge = document.createElement("span"); badge.className = "choice-role"; badge.textContent = "Supporting"; controls.appendChild(badge); }
    const heroButton = document.createElement("button"); heroButton.type = "button"; heroButton.textContent = image.id === heroImageId ? "Hero ✓" : "Set hero";
    heroButton.addEventListener("click", event => { event.stopPropagation(); heroImageId = image.id; supportingImageIds.delete(image.id); supportingImageLabels.delete(image.id); renderImagePicker(); renderSupportingLabelEditor(); renderCreativePack(); });
    card.addEventListener("click", () => { const maximumSupporting = categorySelect.value === "beach" ? 2 : 3; if (image.id === heroImageId) return; if (supportingImageIds.has(image.id)) { supportingImageIds.delete(image.id); supportingImageLabels.delete(image.id); } else if (supportingImageIds.size < maximumSupporting) supportingImageIds.add(image.id); else { setMessage(`You can choose up to ${maximumSupporting} supporting images.`, "error"); return; } renderImagePicker(); renderSupportingLabelEditor(); renderCreativePack(); });
    card.append(photo, controls, heroButton); imagePicker.appendChild(card);
  });
  imagePickerStatus.textContent = heroImageId ? `Hero + ${supportingImageIds.size} supporting` : "Choose a hero image";
}

function suggestedSupportingLabel(imageId, index) {
  return creativePack?.imageLabels?.find(image => image.id === imageId)?.label || `Supporting image ${index + 1}`;
}

function renderSupportingLabelEditor() {
  const supportsPhotoLabels = ["accommodation", "beach", "restaurant", "local-business"].includes(categorySelect.value);
  supportingLabelEditor.hidden = !supportsPhotoLabels || !supportingImageIds.size;
  supportingLabelFields.replaceChildren();
  if (supportingLabelEditor.hidden) return;
  [...supportingImageIds].forEach((imageId, index) => {
    const label = document.createElement("label");
    label.textContent = `Supporting ${index + 1}`;
    const input = document.createElement("input");
    input.type = "text"; input.maxLength = 42; input.placeholder = ["restaurant", "local-business"].includes(categorySelect.value) ? "Choose a verified listing detail" : "Optional verified label";
    input.value = supportingImageLabels.get(imageId) || "";
    input.setAttribute("aria-label", `Supporting image ${index + 1} label`);
    if (["restaurant", "local-business"].includes(categorySelect.value)) {
      const listId = `${categorySelect.value}-label-options-${index}`;
      const options = Array.isArray(creativePack?.supportingLabelOptions) ? creativePack.supportingLabelOptions : [];
      input.setAttribute("list", listId);
      const dataList = document.createElement("datalist"); dataList.id = listId;
      options.forEach(option => { const item = document.createElement("option"); item.value = option; dataList.appendChild(item); });
      label.appendChild(dataList);
    }
    input.addEventListener("input", () => { const value = input.value.trim(); if (value) supportingImageLabels.set(imageId, value); else supportingImageLabels.delete(imageId); renderCreativePack(); });
    label.appendChild(input); supportingLabelFields.appendChild(label);
  });
}

function factElement(fact) {
  const label = document.createElement("label"); label.className = "fact-option";
  const input = document.createElement("input"); input.type = "checkbox"; input.checked = selectedFactIds.has(fact.id);
  input.addEventListener("change", () => { if (input.checked) selectedFactIds.add(fact.id); else selectedFactIds.delete(fact.id); renderCreativePack(); });
  const text = document.createElement("span"); const name = document.createElement("strong"); name.textContent = fact.label; const value = document.createElement("small"); value.textContent = fact.value; text.append(name, value); label.append(input, text); return label;
}

function renderFactPicker() {
  creativeFactPicker.replaceChildren(); if (!creativePack) return;
  creativePack.factGroups.forEach(group => { const section = document.createElement("section"); section.className = "fact-group"; const title = document.createElement("h4"); title.textContent = group.label; section.appendChild(title); group.facts.forEach(fact => section.appendChild(factElement(fact))); creativeFactPicker.appendChild(section); });
  creativeFactStatus.textContent = `${selectedFactIds.size} verified fact${selectedFactIds.size === 1 ? "" : "s"} selected`;
}

function packFactElement(fact) { const card = document.createElement("div"); card.className = `pack-fact${isAccommodationPrimaryFact(fact) || isBeachPrimaryFact(fact) ? " primary-fact" : ""}`; const label = document.createElement("strong"); label.textContent = fact.label; const value = document.createElement("span"); value.textContent = fact.value; card.append(label, value); return card; }
function selectedPackImages() { const byId = new Map(canonicalImages.map(image => [image.id, image])); return [heroImageId, ...supportingImageIds].map(id => byId.get(id)).filter(Boolean); }

function renderCreativePack() {
  if (!creativePack) { creativePackEmpty.hidden = false; creativePackContent.hidden = true; return; }
  creativePackEmpty.hidden = true; creativePackContent.hidden = false; creativeProfileBadge.textContent = creativePack.profile.displayName;
  packIdentity.replaceChildren(); const title = document.createElement("h3"); title.textContent = creativePack.identity.title; const meta = document.createElement("p"); meta.textContent = [creativePack.identity.category, creativePack.identity.location].filter(Boolean).join(" · "); packIdentity.append(title, meta);
  packImages.replaceChildren(); selectedPackImages().forEach((image, index) => { const card = document.createElement("div"); card.className = "pack-image"; const photo = document.createElement("img"); photo.src = image.url; photo.alt = index === 0 ? "Hero image" : `Supporting image ${index}`; if (!["accommodation", "beach", "restaurant", "beachBar", "localBusiness"].includes(creativePack.profile.id)) { const label = document.createElement("span"); const customLabel = supportingImageLabels.get(image.id) || suggestedSupportingLabel(image.id, index - 1); label.textContent = index === 0 ? "Hero" : `Supporting ${index} · ${customLabel}`; card.appendChild(label); } card.prepend(photo); packImages.appendChild(card); });
  if (!packImages.childElementCount) { const note = document.createElement("p"); note.className = "picker-empty"; note.textContent = "Choose published photos to include them in the visual brief."; packImages.appendChild(note); }
  const selected = selectedCreativeFacts(); const localBusiness = categorySelect.value === "local-business"; const practicalGroups = new Set(["practical", ...(localBusiness ? [] : ["service"])]); const restaurantFamily = categorySelect.value === "restaurant"; const restaurantSecondaryIds = new Set(["features", "price", "sunbed-price", "hours"]); const beachPrimary = creativePack.profile.id === "beach" ? selectedBeachPrimaryFacts(selected) : []; const beachPrimaryIds = new Set(beachPrimary.map(fact => fact.id)); packKeyFacts.replaceChildren(); packPracticalFacts.replaceChildren(); selected.forEach(fact => ((creativePack.profile.id === "beach" && !beachPrimaryIds.has(fact.id)) || (restaurantFamily && restaurantSecondaryIds.has(fact.id)) || practicalGroups.has(fact.group) ? packPracticalFacts : packKeyFacts).appendChild(packFactElement(fact)));
  if (!packKeyFacts.childElementCount) packKeyFacts.textContent = "Select verified facts from the left panel."; if (!packPracticalFacts.childElementCount) packPracticalFacts.textContent = "No practical information selected.";
  packDescriptions.replaceChildren();
  const addDescription = (heading, value) => { if (!value) return; const block = document.createElement("article"); block.className = "pack-description"; const titleElement = document.createElement("h3"); titleElement.textContent = heading; const copy = document.createElement("div"); copy.textContent = value; block.append(titleElement, copy); packDescriptions.appendChild(block); };
  if (includeShortDescription.checked) addDescription("Short description", creativePack.descriptions.short); if (includeLongDescription.checked) addDescription("Long description", creativePack.descriptions.long); if (!packDescriptions.childElementCount) packDescriptions.textContent = "No description selected.";
}

async function loadCanonicalImages() {
  const listingId = listingSelect.value; const category = categorySelect.value; if (!listingId) return resetImagePicker();
  resetListingDependentState(); resetImagePicker("Loading published listing photos…"); imagePickerStatus.textContent = "Loading…";
  try {
    const accessToken = await getAccessToken();
    const response = await fetch("/api/social/listing-assets", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ category, listingId, language: languageSelect.value }) });
    const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "The listing photos could not be loaded."); if (listingSelect.value !== listingId || categorySelect.value !== category) return;
    canonicalImages = Array.isArray(result.images) ? result.images : []; heroImageId = canonicalImages[0]?.id || "";
    // Beach records normally provide exactly three canonical photos.  Their
    // dedicated layout always uses the hero plus two clean supporting views.
    // This only changes the Studio selection state; it never generates an image.
    supportingImageIds = category === "beach" ? new Set(canonicalImages.slice(1, 3).map(image => image.id)) : new Set();
    creativePack = result.creativePack || null; selectedFactIds = new Set((creativePack?.profile?.id === "beach" ? selectedBeachPrimaryFacts() : allCreativeFacts().filter(fact => fact.priority >= 70 && !(category === "restaurant" && ["hours", "features", "price", "sunbed-price"].includes(fact.id)))).map(fact => fact.id));
    includeShortDescription.disabled = !creativePack?.descriptions?.short; includeShortDescription.checked = Boolean(creativePack?.descriptions?.short);
    includeLongDescription.disabled = !creativePack?.descriptions?.long; includeLongDescription.checked = false;
    accommodationPromotion.hidden = categorySelect.value !== "accommodation";
    renderImagePicker(); renderSupportingLabelEditor(); renderFactPicker(); renderCreativePack();
  } catch (error) { console.error("Listing assets error", error); resetImagePicker(error.message || "The listing photos could not be loaded."); setMessage(error.message || "The listing photos could not be loaded.", "error"); }
}

function setBusy(busy, label = "Generating social image…") { isGenerating = busy; generateButton.disabled = busy; suggestTextButton.disabled = busy; generateButton.textContent = busy ? label : "✦ Generate social image"; }
function renderDraft(draft) { document.getElementById("hook").value = draft.hook || ""; document.getElementById("caption").value = draft.caption || ""; document.getElementById("cta").value = draft.cta || ""; document.getElementById("hashtags").value = Array.isArray(draft.hashtags) ? draft.hashtags.join(" ") : ""; if (typeof draft.onImageText === "string") textOnImage.value = draft.onImageText; if (typeof draft.onImageHeadline === "string") textOnImage.value = draft.onImageHeadline; if (typeof draft.onImageSubheadline === "string") textOnImageSubheadline.value = draft.onImageSubheadline; draftPreview.hidden = false; }

async function suggestText() {
  const payload = { category: categorySelect.value, listingId: listingSelect.value, language: languageSelect.value, platform: platformSelect.value, angle: selectedAngle() };
  if (!payload.listingId || !payload.angle) return setMessage("Choose a listing and content angle before suggesting text.", "error");
  suggestTextButton.disabled = true; setMessage("Creating an editable text suggestion from published listing data…");
  try { const accessToken = await getAccessToken(); const response = await fetch("/api/social/generate", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "The text suggestion could not be created."); renderDraft(result.draft || {}); setMessage("Text suggestion created. Review and edit it before publishing."); } catch (error) { console.error("Suggest text error", error); setMessage(error.message || "The text suggestion could not be created.", "error"); } finally { suggestTextButton.disabled = false; }
}

function imagePayload() { return { category: categorySelect.value, listingId: listingSelect.value, language: languageSelect.value, platform: platformSelect.value, angle: selectedAngle(), mode: selectedMode(), heroImageId, supportingImageIds: [...supportingImageIds], supportingImageLabels: [...supportingImageIds].map(id => supportingImageLabels.get(id) || ""), manualPromotion: manualPromotion(), textOnImage: textOnImage.value, textOnImageSubheadline: textOnImageSubheadline.value, includeLogo: includeLogo.checked }; }
async function generateImage() {
  if (isGenerating || activeWorkflow !== "poster") return;
  const payload = imagePayload(); if (!payload.listingId || !payload.angle || !payload.heroImageId) return setMessage("Choose a listing, content angle, and hero image before generating.", "error");
  const enhanced = payload.mode === "enhanced"; setBusy(true, enhanced ? "Creating AI enhanced visual…" : "Building safe branded layout…"); setMessage(enhanced ? "Creating the AI enhanced visual from canonical photo references…" : "Building the visual from unchanged canonical photos…");
  try { const accessToken = await getAccessToken(); const response = await fetch("/api/social/generate-image", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) }); const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "The social visual could not be created."); const image = result.image || {}; if (typeof image.dataUrl !== "string" || !image.dataUrl.startsWith("data:image/")) throw new Error("The social visual response was invalid."); finalVisual.src = image.dataUrl; downloadButton.href = image.dataUrl; downloadButton.download = image.fileName || "halkidiki-explorer-social.jpg"; emptyPreview.hidden = true; visualPreview.hidden = false; renderDraft(result.draft || {}); setMessage(enhanced ? "AI enhanced visual created. Review the real property before publishing." : "Safe branded layout created from unchanged published photos."); visualPreview.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (error) { console.error("Generate image error", error); setMessage(error.message || "The social visual could not be created.", "error"); } finally { setBusy(false); }
}

async function copyText(value, button, success = "Copied") { if (!value) return; try { await navigator.clipboard.writeText(value); const original = button.textContent; button.textContent = success; window.setTimeout(() => { button.textContent = original; }, 1400); } catch (error) { console.error("Copy failed", error); creativeFactStatus.textContent = "Copy is unavailable. Select the text and copy it manually."; } }
function restaurantFamilyCreativeBrief() {
  const selected = selectedCreativeFacts().filter(fact => !["features", "price", "sunbed-price", "hours", "zone"].includes(fact.id));
  const byId = new Map(selected.map(fact => [fact.id, fact]));
  const text = id => byId.get(id)?.value || "";
  const type = text("restaurant-type");
  const food = text("cuisine") || text("offerings");
  const hospitality = [text("sea-view") ? "Sea View" : "", text("family-friendly") ? "Family Friendly" : ""].filter(Boolean).join(" • ");
  const lines = ["Create a professional restaurant promotional social image.", "", "NAME + TYPE", [creativePack.identity.title, type].filter(Boolean).join(" · ")];
  if (food || type) lines.push("", "TYPE + CUISINE / FOOD TYPE", [type, food].filter(Boolean).join(" · "));
  if (creativePack.identity.location) lines.push("", "BEACH / LOCAL DESTINATION", creativePack.identity.location);
  if (text("atmosphere")) lines.push("", "ATMOSPHERE", text("atmosphere"));
  if (hospitality) lines.push("", "SEA VIEW / FAMILY FRIENDLY", hospitality);
  if (text("dining-options") || text("service")) lines.push("", "DINING OPTIONS", text("dining-options") || text("service"));
  const used = new Set(["restaurant-type", "cuisine", "offerings", "atmosphere", "sea-view", "family-friendly", "dining-options", "service"]);
  const remaining = selected.filter(fact => !used.has(fact.id)); if (remaining.length) lines.push("", "OTHER VERIFIED HOSPITALITY DETAILS", ...remaining.map(fact => `- ${fact.label}: ${fact.value}`));
  const descriptions = []; if (includeShortDescription.checked && creativePack.descriptions.short) descriptions.push(creativePack.descriptions.short); if (includeLongDescription.checked && creativePack.descriptions.long) descriptions.push(creativePack.descriptions.long); if (descriptions.length) lines.push("", "DESCRIPTION", ...descriptions);
  const images = selectedPackImages(); if (images.length) lines.push("", "SELECTED REFERENCE IMAGES", "Hero image", ...images.slice(1).map((image, index) => { const label = supportingImageLabels.get(image.id); return label ? `Supporting image ${index + 1} — ${label}` : `Supporting image ${index + 1}`; }));
  lines.push("", "Use the supplied real restaurant and food photos. Do not invent dishes, cuisine types, prices, services or facilities.", "Use only the verified information above.");
  return lines.join("\n");
}
function localBusinessCreativeBrief() {
  const selected = selectedCreativeFacts().filter(fact => !["hours", "address", "phone", "website"].includes(fact.id));
  const byId = new Map(selected.map(fact => [fact.id, fact])); const text = id => byId.get(id)?.value || "";
  const lines = ["Create a professional local-business promotional social image using the supplied real photos and verified listing information.", "", "BUSINESS NAME", creativePack.identity.title];
  if (text("business-category")) lines.push("", "CATEGORY / TYPE", text("business-category"));
  if (text("service-subtitle")) lines.push("", "SHORT SERVICE DESCRIPTION", text("service-subtitle"));
  if (text("linked-beaches")) lines.push("", "LINKED BEACHES", text("linked-beaches"));
  if (text("business-location") || creativePack.identity.location) lines.push("", "LOCATION", text("business-location") || creativePack.identity.location);
  const remaining = selected.filter(fact => !["business-category", "service-subtitle", "linked-beaches", "business-location"].includes(fact.id)); if (remaining.length) lines.push("", "OTHER VERIFIED LISTING DETAILS", ...remaining.map(fact => `- ${fact.label}: ${fact.value}`));
  const descriptions = []; if (includeShortDescription.checked && creativePack.descriptions.short) descriptions.push(creativePack.descriptions.short); if (includeLongDescription.checked && creativePack.descriptions.long) descriptions.push(creativePack.descriptions.long); if (descriptions.length) lines.push("", "CANONICAL DESCRIPTION", ...descriptions);
  const images = selectedPackImages(); if (images.length) lines.push("", "SELECTED IMAGES", "Hero image", ...images.slice(1).map((image, index) => { const label = supportingImageLabels.get(image.id); return label ? `Supporting image ${index + 1} — ${label}` : `Supporting image ${index + 1}`; }));
  lines.push("", "Do not invent services, locations, linked beaches, booking options or facilities.", "Use only the verified information above.");
  return lines.join("\n");
}
function creativeBrief() {
  if (!creativePack) return "";
  if (categorySelect.value === "restaurant") return restaurantFamilyCreativeBrief();
  if (categorySelect.value === "local-business") return localBusinessCreativeBrief();
  const lines = ["Create a professional social-media promotional image for this listing.", "", "LISTING", creativePack.identity.title, "", "CATEGORY", creativePack.identity.category];
  if (creativePack.identity.location) lines.push("", "LOCATION", creativePack.identity.location);
  const facts = selectedCreativeFacts(); if (facts.length) lines.push("", "VERIFIED FACTS", ...facts.map(fact => `- ${fact.label}: ${fact.value}`));
  const descriptions = []; if (includeShortDescription.checked && creativePack.descriptions.short) descriptions.push(creativePack.descriptions.short); if (includeLongDescription.checked && creativePack.descriptions.long) descriptions.push(creativePack.descriptions.long); if (descriptions.length) lines.push("", "DESCRIPTION", ...descriptions);
  const images = selectedPackImages(); if (images.length) lines.push("", "SELECTED REFERENCE IMAGES", "Hero image", ...images.slice(1).map((image, index) => { const customLabel = supportingImageLabels.get(image.id); const label = ["accommodation", "beach", "restaurant", "local-business"].includes(categorySelect.value) ? customLabel : customLabel || suggestedSupportingLabel(image.id, index); return label ? `Supporting image ${index + 1} — ${label}` : `Supporting image ${index + 1}`; }));
  if (categorySelect.value === "accommodation") lines.push("", "Create a unique accommodation promotional design. Use the supplied real property photos as references. Do not invent rooms, pools, views, facilities or prices.");
  if (categorySelect.value === "beach") lines.push("", "Create a unique scenic beach promotional design. Use the supplied real beach photos as references. Do not invent facilities, services, beach type, water conditions, Blue Flag status or activities.");
  if (categorySelect.value === "restaurant") lines.push("", "Create a professional restaurant promotional social image. Use the supplied real restaurant and food photos. Do not invent dishes, cuisine types, prices, services or facilities.");
  lines.push("Use only the verified information above. Do not invent facilities, prices, distances, services, views, or other details not provided."); return lines.join("\n");
}

function switchWorkflow(workflow) {
  activeWorkflow = workflow;
  document.querySelectorAll(".workflow-tab").forEach(button => { const active = button.dataset.workflow === workflow; button.classList.toggle("is-active", active); button.setAttribute("aria-pressed", String(active)); });
  document.querySelectorAll(".poster-only").forEach(element => {
    if (workflow !== "poster") { element.hidden = true; return; }
    if (element.id === "visualPreview") element.hidden = !finalVisual.src;
    else if (element.id === "draftPreview") element.hidden = !finalVisual.src && !document.getElementById("hook").value;
    else if (element.id === "emptyPreview") element.hidden = Boolean(finalVisual.src);
    else element.hidden = false;
  }); document.getElementById("posterPreviewHeading").hidden = workflow !== "poster"; creativeSelection.hidden = workflow !== "creative-pack"; creativePackPreview.hidden = workflow !== "creative-pack";
  if (workflow === "creative-pack") { renderFactPicker(); renderCreativePack(); }
}

categorySelect.addEventListener("change", () => { resetListingDependentState(); loadListings(categorySelect.value); });
listingSelect.addEventListener("change", loadCanonicalImages);
languageSelect.addEventListener("change", () => { if (listingSelect.value) loadCanonicalImages(); });
suggestTextButton.addEventListener("click", suggestText);
studioForm.addEventListener("submit", event => { event.preventDefault(); generateImage(); });
document.querySelectorAll(".copy-button[data-copy]").forEach(button => button.addEventListener("click", () => { const field = document.getElementById(button.dataset.copy); if (field) copyText(field.value, button); }));
document.getElementById("regenerateButton").addEventListener("click", generateImage);
document.getElementById("changeTextButton").addEventListener("click", () => textOnImage.focus());
document.getElementById("changePhotosButton").addEventListener("click", () => document.getElementById("imagePickerSection").scrollIntoView({ behavior: "smooth", block: "center" }));
document.querySelectorAll(".workflow-tab").forEach(button => button.addEventListener("click", () => switchWorkflow(button.dataset.workflow)));
document.getElementById("selectAllFactsButton").addEventListener("click", () => { selectedFactIds = new Set(allCreativeFacts().map(fact => fact.id)); renderFactPicker(); renderCreativePack(); });
document.getElementById("clearFactsButton").addEventListener("click", () => { selectedFactIds.clear(); renderFactPicker(); renderCreativePack(); });
includeShortDescription.addEventListener("change", renderCreativePack); includeLongDescription.addEventListener("change", renderCreativePack);
promotionalPriceAmount.addEventListener("input", renderCreativePack); promotionalPriceCurrency.addEventListener("change", renderCreativePack); promotionalPriceUnit.addEventListener("change", renderCreativePack);
document.getElementById("copyAllFactsButton").addEventListener("click", event => copyText(selectedCreativeFacts().map(fact => `${fact.label}: ${fact.value}`).join("\n"), event.currentTarget));
document.getElementById("copyShortDescriptionButton").addEventListener("click", event => copyText(includeShortDescription.checked ? creativePack?.descriptions?.short : "", event.currentTarget));
document.getElementById("copyLongDescriptionButton").addEventListener("click", event => copyText(includeLongDescription.checked ? creativePack?.descriptions?.long : "", event.currentTarget));
document.getElementById("copyAiBriefButton").addEventListener("click", event => copyText(creativeBrief(), event.currentTarget, "AI brief copied"));
connectFacebookButton.addEventListener("click", () => connectMeta("facebook"));
connectInstagramButton.addEventListener("click", () => connectMeta("instagram"));
Promise.all([loadListings(categorySelect.value), updateAuthStatus(), loadMetaStatus()]);
