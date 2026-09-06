"use strict";

const { localBusinessDetails, localized, profileFacts } = require("./category-profiles");

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
  // Some canonical records use bullets rather than sentence punctuation. If
  // a complete first sentence is too short, retain a bounded canonical excerpt
  // instead of returning an unusably small summary.
  if (count >= 45) return excerpt.join(" ");
  return words(value).slice(0, 58).join(" ");
}

function beachDescriptionFor(record, language) {
  const suffix = { en: "En", ro: "Ro", el: "El" }[language] || "En";
  const long = clean(record[`description${suffix}`] || localizedDescription(record.description, language) || record.descriptionEn || record.descriptionRo, 2200);
  if (!long) return { short: "", long: "" };

  // This is a canonical excerpt, never model-written copy.  Keeping complete
  // sentences near 50 words makes the Page 1 brief useful but screenshot-safe.
  const excerpt = beachExcerpt(long);
  const hashtags = beachHashtags(record, language);
  const short = excerpt;
  return { short, long: long !== excerpt ? long : "", hashtags };
}

function accommodationHashtags(record, language) {
  const candidates = [
    record[`title${{ en: "En", ro: "Ro", el: "El" }[language] || "En"}`] || canonicalBeachText(record.name, language),
    record.zone,
    "Halkidiki",
    "Accommodation",
    "Greek Holiday"
  ];
  const unique = [];
  candidates.forEach(value => {
    const tag = hashtag(value);
    if (tag && !unique.some(item => item.toLocaleLowerCase() === tag.toLocaleLowerCase()) && unique.length < 4) unique.push(tag);
  });
  const fallback = ["#Halkidiki", "#Accommodation", "#GreekHoliday", "#Travel"];
  fallback.forEach(tag => {
    if (!unique.some(item => item.toLocaleLowerCase() === tag.toLocaleLowerCase()) && unique.length < 4) unique.push(tag);
  });
  return [...unique.slice(0, 4), "#HalkidikiExplorer"];
}

function accommodationDescriptionFor(record, language) {
  const suffix = { en: "En", ro: "Ro", el: "El" }[language] || "En";
  const long = clean(record[`description${suffix}`] || localizedDescription(record.description, language) || record.descriptionEn || record.descriptionRo, 2200);
  if (!long) return { short: "", long: "", hashtags: accommodationHashtags(record, language) };
  const excerpt = beachExcerpt(long);
  return { short: excerpt, long: long !== excerpt ? long : "", hashtags: accommodationHashtags(record, language) };
}

function buildCreativePack({ category, record, facts, language, images, promotionalLocation = "", localBusinessContext = {} }) {
  const details = profileFacts(category, record, facts, language);
  const restaurantFamily = category === "restaurant";
  const localBusiness = category === "local-business" ? localBusinessDetails(record, facts, language, localBusinessContext.linkedBeachNames) : null;
  const descriptions = category === "beach"
    ? beachDescriptionFor(record, language)
    : category === "accommodation"
      ? accommodationDescriptionFor(record, language)
      : descriptionFor(record, language);

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
    imageLabels: (images || []).map(image => ({ id: image.id }))
  };
}

module.exports = { buildCreativePack };
