"use strict";

const { localized, profileFacts, restaurantSupportingLabelOptions, supportingPhotoLabels } = require("./category-profiles");

function clean(value, maximum = 2200) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
}

function descriptionFor(record, language) {
  const suffix = { en: "En", ro: "Ro", el: "El" }[language] || "En";
  const long = clean(record[`description${suffix}`] || localized(record.description, language) || record.descriptionEn || record.descriptionRo, 2200);
  const short = clean(record[`shortDescription${suffix}`] || record.shortDescription || long.split(/(?<=[.!?])\s/)[0], 360);
  return { short, long: long && long !== short ? long : "" };
}

function buildCreativePack({ category, record, facts, language, images }) {
  const details = profileFacts(category, record, facts, language);
  const descriptions = descriptionFor(record, language);
  const imageLabels = (images || []).map((image, index) => ({
    id: image.id,
    label: index === 0 ? "Hero image" : supportingPhotoLabels(details.profile, index)[index - 1] || `Supporting image ${index}`
  }));

  return {
    profile: { id: details.profile.id, displayName: details.profile.displayName, posterVariant: details.profile.posterVariant },
    identity: { title: details.title, location: details.location, category: details.profile.displayName },
    factGroups: details.groups,
    descriptions,
    imageLabels,
    supportingLabelOptions: details.profile.id === "restaurant" ? restaurantSupportingLabelOptions(record, facts, language) : []
  };
}

module.exports = { buildCreativePack };
