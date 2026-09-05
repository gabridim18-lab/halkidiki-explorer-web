"use strict";

const { localBusinessDetails, localBusinessLabelOptions, localized, profileFacts, restaurantSupportingLabelOptions, supportingPhotoLabels } = require("./category-profiles");

function clean(value, maximum = 2200) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
}

function descriptionFor(record, language) {
  const suffix = { en: "En", ro: "Ro", el: "El" }[language] || "En";
  const long = clean(record[`description${suffix}`] || localized(record.description, language) || record.descriptionEn || record.descriptionRo, 2200);
  const short = clean(record[`shortDescription${suffix}`] || record.shortDescription || long.split(/(?<=[.!?])\s/)[0], 360);
  return { short, long: long && long !== short ? long : "" };
}

function buildCreativePack({ category, record, facts, language, images, promotionalLocation = "", localBusinessContext = {} }) {
  const details = profileFacts(category, record, facts, language);
  const restaurantFamily = category === "restaurant";
  const localBusiness = category === "local-business" ? localBusinessDetails(record, facts, language, localBusinessContext.linkedBeachNames) : null;
  const descriptions = descriptionFor(record, language);
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
