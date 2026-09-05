"use strict";

/*
 * One server-side vocabulary for the Studio.  Values are always read from a
 * freshly fetched canonical record; this module never accepts browser facts.
 */
function clean(value, maximum = 220) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maximum) : "";
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function localized(value, language = "en") {
  if (typeof value === "string") return clean(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  return clean(value[language] || value.en || value.ro || value.el || value.gr);
}

function values(list, language, maximum = 5) {
  if (!Array.isArray(list)) return [];
  return list.map(item => localized(item, language)).filter(Boolean).slice(0, maximum);
}

function titleFor(record, facts, language) {
  const suffix = { en: "En", ro: "Ro", el: "El" }[language] || "En";
  return clean(record[`title${suffix}`] || facts[`title${suffix}`] || localized(record.name, language) || facts.title || facts.titleEn || facts.id, 100);
}

function add(group, id, label, value, priority = 50) {
  const text = clean(value);
  return text ? { id, group, label, value: text, priority } : null;
}

function truth(group, id, label, condition, priority = 55) {
  return condition ? { id, group, label, value: "Available", priority } : null;
}

function count(label, value) {
  const amount = number(value);
  return amount === null ? "" : `${amount} ${label}${amount === 1 ? "" : "s"}`;
}

function joinValues(list, language, maximum) {
  return values(list, language, maximum).join(" · ");
}

function localizedValues(value, language, maximum = 5) {
  if (Array.isArray(value)) return values(value, language, maximum);
  if (!value || typeof value !== "object") return [];
  const selected = value[language] || value.en || value.ro || value.el || value.gr;
  if (Array.isArray(selected)) return values(selected, language, maximum);
  const text = localized(selected, language);
  return text ? [text] : [];
}

function displayCanonicalTerm(value) {
  const text = clean(value, 80);
  if (!text) return "";
  return text.replace(/[_-]+/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function restaurantSupportingLabelOptions(record = {}, facts = {}, language = "en") {
  const options = [];
  const collections = [
    record.cuisineTypes || facts.cuisineTypes,
    record.atmosphere || facts.atmosphere,
    record.highlights || facts.highlights,
    record.features || facts.features,
    record.offerings || facts.offerings,
    record.serviceOptions || facts.serviceOptions,
    record.diningOptions || facts.diningOptions
  ];
  collections.forEach(collection => {
    (Array.isArray(collection) ? collection : []).forEach(value => {
      const label = typeof value === "string" ? displayCanonicalTerm(value) : localized(value, language);
      if (label) options.push(clean(label, 42));
    });
  });
  return [...new Map(options.map(option => [option.toLocaleLowerCase(), option])).values()].slice(0, 40);
}

const PROFILE_DEFINITIONS = Object.freeze({
  accommodation: {
    id: "accommodation", displayName: "Accommodation", posterVariant: "property", headlineStyle: "stay", ctaStyle: "stay",
    photoLabels: ["Property exterior", "Living space", "Stay detail", "Local setting"]
  },
  beach: {
    id: "beach", displayName: "Beach", posterVariant: "coastal", headlineStyle: "coast", ctaStyle: "explore",
    photoLabels: ["Coastline", "Beach view", "Water detail", "Beach atmosphere"]
  },
  restaurant: {
    id: "restaurant", displayName: "Restaurant / Taverna", posterVariant: "dining", headlineStyle: "dining", ctaStyle: "visit",
    photoLabels: ["Dining setting", "Food or drink", "Restaurant detail", "Atmosphere"]
  },
  beachBar: {
    id: "beachBar", displayName: "Beach Bar", posterVariant: "beach-energy", headlineStyle: "beach-energy", ctaStyle: "enjoy",
    photoLabels: ["Beach bar scene", "Sunbed or beach", "Food or drink", "Beach energy"]
  },
  localBusiness: {
    id: "localBusiness", displayName: "Local Business", posterVariant: "service", headlineStyle: "service", ctaStyle: "contact",
    photoLabels: ["Service overview", "Business detail", "Local service", "Practical detail"]
  },
  whatToDo: {
    id: "whatToDo", displayName: "What to do", posterVariant: "activity", headlineStyle: "activity", ctaStyle: "experience",
    photoLabels: ["Activity scene", "Experience detail", "Local setting", "Plan your visit"]
  }
});

function resolveCategoryProfile(category, record = {}) {
  if (category === "restaurant") return record?.type === "beach_bar" ? PROFILE_DEFINITIONS.beachBar : PROFILE_DEFINITIONS.restaurant;
  if (category === "accommodation") return PROFILE_DEFINITIONS.accommodation;
  if (category === "beach") return PROFILE_DEFINITIONS.beach;
  if (category === "local-business") return PROFILE_DEFINITIONS.localBusiness;
  return PROFILE_DEFINITIONS.whatToDo;
}

function profileFacts(category, record, facts, language = "en") {
  const profile = resolveCategoryProfile(category, record);
  const groups = [];
  const push = (name, label, items) => {
    const present = items.filter(Boolean);
    if (present.length) groups.push({ id: name, label, facts: present });
  };
  const location = clean(record.zone || facts.zone || record.beachSlug || facts.beachSlug || record.address || facts.address);
  const identity = [
    add("identity", "category", "Category", profile.displayName, 100),
    add("identity", "location", "Location", location, 95)
  ];
  push("identity", "Identity", identity);

  if (profile.id === "accommodation") {
    push("stay", "Stay details", [
      add("stay", "guests", "Capacity", count("guest", record.guests ?? facts.guests), 100),
      add("stay", "bedrooms", "Bedrooms", count("bedroom", record.bedrooms ?? facts.bedrooms), 95),
      add("stay", "price", "Price", record.price || facts.price, 98),
      add("stay", "bathrooms", "Bathrooms", count("bathroom", record.bathrooms ?? facts.bathrooms), 90),
      add("stay", "size", "Size", number(record.sizeSqm ?? facts.sizeSqm) === null ? "" : `${record.sizeSqm ?? facts.sizeSqm} m²`, 70),
      add("stay", "beach-distance", "Distance to beach", number(record.distanceMetersOverride ?? facts.distanceMetersOverride) === null ? "" : `${record.distanceMetersOverride ?? facts.distanceMetersOverride} m`, 88),
      add("stay", "view", "View", record.view || facts.view, 72)
    ]);
    push("amenities", "Verified amenities", [
      truth("amenities", "pool", "Pool", record.pool ?? facts.pool, 82), truth("amenities", "wifi", "Wi‑Fi", record.wifi ?? facts.wifi, 80),
      truth("amenities", "air-conditioning", "Air conditioning", record.airConditioning ?? facts.airConditioning, 80), truth("amenities", "parking", "Parking", record.parking ?? facts.parking, 78),
      truth("amenities", "kitchen", "Kitchen", record.kitchen ?? facts.kitchen, 74), truth("amenities", "balcony", "Balcony", record.balcony ?? facts.balcony, 73),
      truth("amenities", "bbq", "BBQ", record.bbq ?? facts.bbq, 65), truth("amenities", "pet-friendly", "Pet friendly", record.petFriendly ?? facts.petFriendly, 65)
    ]);
  } else if (profile.id === "beach") {
    const facilities = record.facilities && typeof record.facilities === "object" ? record.facilities : {};
    const water = record.water && typeof record.water === "object" ? record.water : {};
    const quick = record.quickFacts && typeof record.quickFacts === "object" ? record.quickFacts : {};
    const beachInfo = record.beachInfo && typeof record.beachInfo === "object" ? record.beachInfo : {};
    push("coast", "Beach details", [
      add("coast", "beach-type", "Beach type", localized(record.beachType, language), 100), add("coast", "length", "Length", number(record.length) === null ? "" : `${record.length} m`, 80),
      add("coast", "sand", "Sand", localized(record.sand, language), 72), add("coast", "water-clarity", "Water clarity", localized(water.clarity, language), 82),
      add("coast", "water-entry", "Water entry", localized(beachInfo.waterEntry, language), 94), add("coast", "water-depth", "Water depth", localized(water.depth, language), 76),
      add("coast", "blue-flag", "Blue Flag", record.blueFlag ? "Verified" : "", 92), add("coast", "family-friendly", "Family suitability", record.suitableForChildren ? "Kids friendly" : "", 96), truth("coast", "sunset", "Sunset view", record.sunsetView, 70),
      add("coast", "occupancy", "Occupancy", record.occupancy, 55), add("coast", "parking-difficulty", "Parking", localized(quick.parkingDifficulty, language), 55)
    ]);
    push("beach-experience", "Beach experience", [
      add("beach-experience", "activities", "Activities", localizedValues(record.activities, language, 2).join(" · "), 78), add("beach-experience", "ideal-for", "Ideal for", localizedValues(record.idealFor, language, 3).join(" · "), 74),
      add("beach-experience", "highlights", "Highlights", localizedValues(record.highlights, language, 4).join(" · "), 68), truth("beach-experience", "sunbeds", "Sunbeds", facilities.sunbeds, 72),
      truth("beach-experience", "toilets", "Toilets", facilities.toiletsAvailable, 60), truth("beach-experience", "parking-available", "Parking available", facilities.parkingAvailable, 63),
      truth("beach-experience", "accessible", "Accessible", facilities.accessible, 63)
    ]);
  } else if (profile.id === "beachBar") {
    push("beach-bar", "Beach bar details", [
      add("beach-bar", "price", "Price", record.price || facts.price, 70), add("beach-bar", "sunbed-price", "Sunbed price", record.sunbedPrice, 92),
      truth("beach-bar", "consumption-included", "Sunbed consumption included", record.sunbedConsumationIncluded, 88), add("beach-bar", "music", "Music style", joinValues(record.musicStyles, language, 4), 82),
      add("beach-bar", "hours", "Opening hours", localized(record.hours, language) || record.hoursEn || facts.hoursEn || facts.hours, 65), add("beach-bar", "rating", "Rating", record.rating || facts.rating, 62)
    ]);
    push("food-drink", "Food & drink", [
      add("food-drink", "cuisine", "Cuisine", joinValues(record.cuisineTypes, language, 5), 70), add("food-drink", "features", "Features", joinValues(record.features, language, 5), 76),
      add("food-drink", "atmosphere", "Atmosphere", joinValues(record.atmosphere, language, 4), 75), add("food-drink", "offerings", "Offerings", joinValues(record.offerings, language, 4), 62),
      add("food-drink", "service", "Service options", joinValues(record.serviceOptions, language, 4), 60)
    ]);
  } else if (profile.id === "restaurant") {
    push("dining", "Dining details", [
      add("dining", "restaurant-type", "Type", displayCanonicalTerm(record.type || facts.type), 99), add("dining", "cuisine", "Cuisine", restaurantSupportingLabelOptions({ cuisineTypes: record.cuisineTypes || facts.cuisineTypes }, {}, language).slice(0, 3).join(" · "), 100), add("dining", "price", "Price", record.price || facts.price, 76),
      add("dining", "rating", "Rating", record.rating || facts.rating, 75),
      add("dining", "atmosphere", "Atmosphere", joinValues(record.atmosphere, language, 4), 82), add("dining", "features", "Features", joinValues(record.features, language, 5), 80),
      add("dining", "service", "Service options", joinValues(record.serviceOptions, language, 4), 65), add("dining", "dining-options", "Dining options", joinValues(record.diningOptions, language, 4), 60)
    ]);
    push("practical", "Practical information", [
      add("practical", "hours", "Opening hours", localized(record.hours, language) || record.hoursEn || facts.hoursEn || facts.hours, 25)
    ]);
  } else if (profile.id === "localBusiness") {
    push("service", "Service details", [
      add("service", "business-category", "Service type", localized(record.categoryEn, language) || record.categoryEn || facts.categoryEn || facts.category, 100),
      add("service", "booking", "Booking", record.booking, 78), add("service", "hours", "Hours", localized(record.hours, language) || record.hoursEn || facts.hoursEn || facts.hours, 72),
      add("service", "linked-beaches", "Linked beaches", joinValues(record.beaches, language, 5), 60)
    ]);
    push("practical", "Practical information", [add("practical", "address", "Address", record.address || facts.address, 70), add("practical", "phone", "Phone", record.phone, 55), add("practical", "website", "Website", record.website, 45)]);
  } else {
    push("activity", "Experience details", [
      add("activity", "activity-category", "Activity type", record.categoryEn || facts.categoryEn || facts.category, 100), add("activity", "price", "Price", record.price || facts.price, 78),
      add("activity", "hours", "Hours", localized(record.hours, language) || record.hoursEn || facts.hoursEn || facts.hours, 76), add("activity", "linked-beaches", "Linked beaches", joinValues(record.beaches, language, 4), 60)
    ]);
    push("practical", "Practical information", [add("practical", "address", "Address", record.address || facts.address, 70), add("practical", "phone", "Phone", record.phone, 55), add("practical", "website", "Website", record.website, 45)]);
  }

  return { profile, title: titleFor(record, facts, language), location, groups };
}

function posterFacts(category, facts, language = "en") {
  const profile = resolveCategoryProfile(category, facts);
  const record = facts || {};
  const extracted = profileFacts(category, record, facts, language).groups.flatMap(group => group.facts)
    .filter(item => item.id !== "category" && item.id !== "location")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);
  return { profile, facts: extracted };
}

function profileHeadline(profile, title, language = "en") {
  const lead = {
    en: { stay: "Stay at", coast: "Explore", dining: "Discover", "beach-energy": "Beach time at", service: "Discover", activity: "Experience" },
    ro: { stay: "Cazare la", coast: "Descoperă", dining: "Descoperă", "beach-energy": "Timp de plajă la", service: "Descoperă", activity: "Trăiește experiența" },
    el: { stay: "Μείνετε στο", coast: "Εξερευνήστε", dining: "Ανακαλύψτε", "beach-energy": "Ώρα παραλίας στο", service: "Ανακαλύψτε", activity: "Ζήστε την εμπειρία" }
  };
  const prefix = lead[language]?.[profile.headlineStyle] || lead.en[profile.headlineStyle] || "Discover";
  return clean(title ? `${prefix} ${title}` : prefix, 72);
}

function profileCta(profile, language = "en") {
  const copy = {
    en: { stay: "Plan your stay", explore: "Explore the coast", visit: "Plan your visit", enjoy: "Enjoy the beach day", contact: "Plan with local help", experience: "Plan your experience" },
    ro: { stay: "Planifică-ți sejurul", explore: "Explorează coasta", visit: "Planifică vizita", enjoy: "Bucură-te de ziua de plajă", contact: "Planifică cu ajutor local", experience: "Planifică experiența" },
    el: { stay: "Σχεδιάστε τη διαμονή σας", explore: "Εξερευνήστε την ακτή", visit: "Σχεδιάστε την επίσκεψή σας", enjoy: "Απολαύστε τη μέρα στην παραλία", contact: "Σχεδιάστε με τοπική βοήθεια", experience: "Σχεδιάστε την εμπειρία σας" }
  };
  return copy[language]?.[profile.ctaStyle] || copy.en.visit;
}

function supportingPhotoLabels(profile, count) {
  return Array.from({ length: count }, (_, index) => profile.photoLabels[index + 1] || profile.photoLabels[profile.photoLabels.length - 1] || "Listing detail");
}

module.exports = { PROFILE_DEFINITIONS, displayCanonicalTerm, localized, localizedValues, profileCta, profileFacts, profileHeadline, posterFacts, resolveCategoryProfile, restaurantSupportingLabelOptions, supportingPhotoLabels, titleFor };
