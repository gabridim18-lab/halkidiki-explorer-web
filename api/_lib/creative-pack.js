"use strict";

const { localBusinessDetails, localBusinessLabelOptions, localized, profileFacts, restaurantSupportingLabelOptions, supportingPhotoLabels } = require("./category-profiles");

function clean(value, maximum = 2200) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
}

function localizedDescription(value, language) {
  if (typeof value === "string") return clean(value, 2200);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return clean(value[language] || value.en || value.ro || value.el || value.gr, 2200);
}

function descriptionFor(record, language) {
  const suffix = { en: "En", ro: "Ro", el: "El" }[language] || "En";
  const long = clean(record[`description${suffix}`] || localized(record.description, language) || record.descriptionEn || record.descriptionRo, 2200);
  const short = clean(record[`shortDescription${suffix}`] || record.shortDescription || long.split(/(?<=[.!?])\s/)[0], 360);
  return { short, long: long && long !== short ? long : "" };
}

function words(value) {
  return clean(value, 2200).split(/\s+/).filter(Boolean);
}

function canonicalBeachText(value, language) {
  if (typeof value === "string") return clean(value, 2200);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return clean(value[language] || value.en || value.ro || value.el || value.gr, 2200);
}

function firstBeachActivity(value, language) {
  const selected = value?.[language] || value?.en || value?.ro || value?.el || value?.gr || value;
  if (!Array.isArray(selected)) return canonicalBeachText(selected, language);
  return canonicalBeachText(selected[0], language);
}

function hashtag(value) {
  const token = clean(value, 100).normalize("NFKD").replace(/\p{M}/gu, "").split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean).map(part => `${part.charAt(0).toLocaleUpperCase()}${part.slice(1)}`).join("");
  return token ? `#${token.slice(0, 48)}` : "";
}

function beachHashtags(record, language) {
  const candidates = [
    canonicalBeachText(record.name, language),
    record.zone,
    canonicalBeachText(record.beachType, language),
    firstBeachActivity(record.activities, language),
    record.slug || record.id
  ];
  const unique = [];
  candidates.forEach(value => {
    const tag = hashtag(value);
    if (tag && !unique.some(item => item.toLocaleLowerCase() === tag.toLocaleLowerCase()) && unique.length < 4) unique.push(tag);
  });
  const recordIdTag = hashtag(record.id) || "#Listing";
  while (unique.length < 4) unique.push(`${recordIdTag}${unique.length + 1}`);
  return [...unique, "#HalkidikiExplorer"];
}

function beachExcerpt(value) {
  const sentences = clean(value, 2200).match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const excerpt = [];
  let count = 0;
  for (const sentence of sentences) {
    const sentenceWords = words(sentence);
    if (!sentenceWords.length) continue;
    if (count && count + sentenceWords.length > 56) break;
    excerpt.push(sentence.trim());
    count += sentenceWords.length;
    if (count >= 45) break;
  }
  return excerpt.length ? excerpt.join(" ") : words(value).slice(0, 50).join(" ");
}

function beachDescriptionFor(record, language) {
  const suffix = { en: "En", ro: "Ro", el: "El" }[language] || "En";
  const long = clean(record[`description${suffix}`] || localizedDescription(record.description, language) || record.descriptionEn || record.descriptionRo, 2200);
  if (!long) return { short: "", long: "" };

  // This is a canonical excerpt, never model-written copy.  Keeping complete
  // sentences near 50 words makes the Page 1 brief useful but screenshot-safe.
  const excerpt = beachExcerpt(long);
  const hashtags = beachHashtags(record, language);
  const short = `${excerpt}\n\n${hashtags.join(" ")}`;
  return { short, long: long !== excerpt ? long : "", hashtags };
}

function buildCreativePack({ category, record, facts, language, images, promotionalLocation = "", localBusinessContext = {} }) {
  const details = profileFacts(category, record, facts, language);
  const restaurantFamily = category === "restaurant";
  const localBusiness = category === "local-business" ? localBusinessDetails(record, facts, language, localBusinessContext.linkedBeachNames) : null;
  const descriptions = category === "beach"
    ? beachDescriptionFor(record, language)
    : descriptionFor(record, language);
  const imageLabels = (images || []).map((image, index) => ({
    id: image.id,
    label: index === 0 ? "Hero image" : supportingPhotoLabels(details.profile, index)[index - 1] || `Supporting image ${index}`
  }));

  const factGroups = localBusiness ? details.groups.map(group => ({ ...group, facts: group.facts.map(fact => {
    if (fact.id === "linked-beaches") return { ...fact, value: localBusiness.linkedBeaches.join(" · ") };
    if (fact.id === "business-location") return { ...fact, value: localBusiness.location };
    return fact;
  }).filter(fact => fact.value) })) : details.groups;
  return {
    profile: { id: details.profile.id, displayName: details.profile.displayName, posterVariant: details.profile.posterVariant },
    identity: { title: details.title, location: restaurantFamily ? clean(promotionalLocation, 100) : localBusiness ? localBusiness.location : details.location, category: details.profile.displayName },
    factGroups,
    descriptions,
    imageLabels,
    supportingLabelOptions: restaurantFamily ? restaurantSupportingLabelOptions(record, facts, language) : localBusiness ? localBusinessLabelOptions(localBusiness) : []
  };
}

module.exports = { buildCreativePack };
