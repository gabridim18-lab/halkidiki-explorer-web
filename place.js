const params = new URLSearchParams(window.location.search);

let id = params.get("id");

if (!id) {
  const parts = window.location.pathname
    .split("/")
    .filter(Boolean);

  if (parts[0] === "place" && parts[1]) {
    id = parts[1];
  }
}

const lang = localStorage.getItem("lang") || "en";

const DATA_BASE =
  "https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data/restaurants";

const BEACHES_INDEX =
  "https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/refs/heads/main/data/beaches/beaches-index.json";

async function loadPlace() {
  const indexResponse = await fetch(`${DATA_BASE}/restaurants-index.json`);
  const indexData = await indexResponse.json();

  const found = indexData.find(item => item.id === id);

  if (!found) {
    document.getElementById("place-page").innerHTML = `
      <div class="error-message">Place not found</div>
    `;
    return;
  }

  const response = await fetch(`${DATA_BASE}/${found.id}/index.json`);
  const place = await response.json();

try {
  const beachesResponse = await fetch(BEACHES_INDEX);
  const beaches = await beachesResponse.json();

  const beach = beaches.find(item =>
    item.slug === place.beachSlug ||
    item.id === place.beachSlug
  );

  if (beach) {
    place.connectedBeachHeroImage =
      beach.preview ||
      beach.previewImage ||
      beach.heroImage ||
      beach.image ||
      (beach.images && beach.images[0]) ||
      "";
  }
} catch (error) {
  console.warn("Beach preview not loaded", error);
}

  renderPlace(place);
  setupFavorite(place);
  setupShare(place);
  setupHeroAutoplay();
  setupReservation(place);
  setupMenuModal();
  setupDescription();
}

function getTitle(place) {
  return lang === "ro"
    ? place.titleRo || place.titleEn || place.id
    : place.titleEn || place.titleRo || place.id;
}

function getDescription(place) {
  return lang === "ro"
    ? place.descriptionRo || place.descriptionEn || ""
    : place.descriptionEn || place.descriptionRo || "";
}

function formatBeachName(slug = "") {
  return slug
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, l => l.toUpperCase());
}

function formatLabel(value = "") {
  const labels = {
    restaurant: "Restaurant",
    beach_bar: "Beach Bar",
    seafood: "Seafood",
    greek: "Greek",
    mediterranean: "Mediterranean",
    cocktails: "Cocktails",
    sea_view: "Sea View",
    sunset_view: "Sunset View",
    family_friendly: "Family Friendly",
    pet_friendly: "Pet Friendly",
    live_music: "Live Music",
    dj_sets: "DJ Sets",
    party: "Party",
    lounge: "Lounge",
    chill: "Chill",
    parking: "Parking",
    events: "Events"
  };

  return labels[value] || value.replaceAll("_", " ");
}

function getSubtitle(place) {
  const cuisines = (place.cuisineTypes || [])
    .map(formatLabel)
    .join(" · ");

  if (cuisines) {
    return place.type === "beach_bar"
      ? `${cuisines} · Beach Bar`
      : `${cuisines} · Restaurant`;
  }

  return place.type === "beach_bar"
    ? "Beach Bar"
    : "Restaurant";
}

function getOpeningHoursList(place) {
  if (place.openingHours && place.openingHours.length > 0) {
    return place.openingHours;
  }

  if (!place.hoursEn) return [];

  const days = [
    "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday", "Sunday"
  ];

  return days.map(day => {
    const regex = new RegExp(`${day}\\s*:?\\s*([^;]+)`, "i");
    const match = place.hoursEn.match(regex);

    if (!match) return null;

    const value = match[1].trim();
    const closed = value.toLowerCase().includes("closed");

    return {
      day,
      dayRo: day,
      closed,
      labelEn: closed ? "Closed" : value,
      labelRo: closed ? "Închis" : value
    };
  }).filter(Boolean);
}

function getTodayItem(place) {
  const list = getOpeningHoursList(place);

  const days = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday"
  ];

  return list.find(item => item.day === days[new Date().getDay()]);
}

function getTodayLabel(place) {
  const item = getTodayItem(place);

  if (!item) {
    return lang === "ro"
      ? "Program indisponibil"
      : "Hours not available";
  }

  if (item.closed) {
    return lang === "ro" ? "Închis" : "Closed";
  }

  return lang === "ro"
    ? item.labelRo || item.labelEn
    : item.labelEn || item.labelRo;
}

function renderOpeningHours(place) {
  const list = getOpeningHoursList(place);

  if (list.length === 0) return "";

  return list.map(item => `
    <div class="hours-row">
      <div class="hours-day">
        ${lang === "ro" ? item.dayRo || item.day : item.day}
      </div>
      <div class="hours-time">
        ${item.closed
          ? (lang === "ro" ? "Închis" : "Closed")
          : (lang === "ro"
              ? item.labelRo || item.labelEn
              : item.labelEn || item.labelRo)}
      </div>
    </div>
  `).join("");
}

function mapsUrl(place) {
  if (place.lat && place.lon) {
    return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    place.displayAddress || getTitle(place)
  )}`;
}

function shareSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="25" height="25"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="18" cy="5" r="3"></circle>
      <circle cx="6" cy="12" r="3"></circle>
      <circle cx="18" cy="19" r="3"></circle>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
    </svg>
  `;
}

function directionSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L22 22L12 18L2 22L12 2Z"></path>
    </svg>
  `;
}

function phoneSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23"
      viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.86 19.86 0 0 1 11.19 18.85a19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18A2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.78.59 2.62a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.46-1.11a2 2 0 0 1 2.11-.45c.84.27 1.72.47 2.62.59A2 2 0 0 1 22 16.92z"></path>
    </svg>
  `;
}

function buildExperienceCards(place) {
  const cards = [];
  const images = place.images || [];

  const serviceOptions = place.serviceOptions || [];
  const highlights = place.highlights || [];
  const offerings = place.offerings || [];
  const diningOptions = place.diningOptions || [];
  const atmosphere = place.atmosphere || [];
  const planning = place.planning || [];
  const payments = place.payments || [];
  const children = place.children || [];
  const parking = place.parking || [];
  const pets = place.pets || [];
  const features = place.features || [];
  const cuisines = place.cuisineTypes || [];
  const music = place.musicStyles || [];

  if (cuisines.length || features.includes("restaurant") || features.includes("sea_view")) {
    cards.push({
      emoji: place.type === "beach_bar" ? "🏖️" : "🍽️",
      title: place.type === "beach_bar"
        ? "Beach Bar Identity"
        : "Dining Identity",
      text: [
        ...cuisines.map(formatLabel),
        ...features
          .filter(x => x !== "restaurant")
          .map(formatLabel)
      ].slice(0, 5).join(" · "),
      image: images[0],
      usedGroups: ["Cuisine Types", "Features"]
    });
  }

  if (highlights.length || music.length || atmosphere.length) {
    cards.push({
      emoji: "✨",
      title: "Atmosphere",
      text: [
        ...highlights,
        ...music.map(formatLabel),
        ...atmosphere
      ].slice(0, 5).join(" · "),
      image: images[1] || images[0],
      usedGroups: ["Highlights", "Music", "Atmosphere"]
    });
  }

  if (serviceOptions.length || diningOptions.length || offerings.length) {
    cards.push({
      emoji: "🥂",
      title: "What You Can Enjoy",
      text: [
        ...serviceOptions,
        ...diningOptions,
        ...offerings
      ].slice(0, 6).join(" · "),
      image: images[2] || images[0],
      usedGroups: ["Service Options", "Dining Options", "Offerings"]
    });
  }

  if (planning.length || payments.length || children.length || parking.length || pets.length) {
    cards.push({
      emoji: "✅",
      title: "Easy Visit",
      text: [
        ...planning,
        ...payments,
        ...children,
        ...parking,
        ...pets
      ].slice(0, 6).join(" · "),
      image: images[3] || images[0],
      usedGroups: ["Planning", "Payments", "Children", "Parking", "Pets"]
    });
  }

  return cards
    .filter(card => card.text && card.text.trim().length > 0)
    .slice(0, 5);
}
function buildBeachDayCards(place) {
  if (place.type !== "beach_bar") return [];

  const images = place.images || [];
  const menuImages = place.menuImages || [];

  const sunbedText = [
    place.sunbedPrice ? `Sunbeds: ${place.sunbedPrice}` : "",
    ...(place.amenities || []).filter(item =>
      item.toLowerCase().includes("sunbed") ||
      item.toLowerCase().includes("umbrella")
    ),
    ...(place.features || []).filter(item =>
      ["sunbeds", "beachfront", "sea_view"].includes(item)
    ).map(formatLabel)
  ].filter(Boolean).slice(0, 5).join(" · ");

  const foodText = [
    ...(place.offerings || []),
    ...(place.cuisineTypes || []).map(formatLabel)
  ].filter(Boolean).slice(0, 6).join(" · ");

  const atmosphereText = [
    ...(place.musicStyles || []).map(formatLabel),
    ...(place.atmosphere || []),
    ...(place.highlights || []).filter(item =>
      item.toLowerCase().includes("sunset") ||
      item.toLowerCase().includes("view") ||
      item.toLowerCase().includes("cocktail")
    )
  ].filter(Boolean).slice(0, 6).join(" · ");

  const perfectForText = [
    ...(place.crowd || []),
    ...(place.children || []),
    ...(place.pets || [])
  ].filter(Boolean).slice(0, 5).join(" · ");

  return [
    {
      kicker: "Beach Setup",
      title: "Sunbeds & Relaxation",
      big: place.sunbedPrice || "Beach comfort",
      text: sunbedText,
      image: images[0] || images[1]
    },
    {
      kicker: "Food & Drinks",
      title: "Cocktails, Coffee & Snacks",
      big: "Menu",
      text: foodText,
      image: menuImages[0] || images[2] || images[0]
    },
    {
      kicker: "Vibe",
      title: "Beach Atmosphere",
      big: "Chill",
      text: atmosphereText,
      image: images[2] || images[3] || images[0]
    },
    {
      kicker: "Perfect For",
      title: "Your Day by the Sea",
      big: "Relax",
      text: perfectForText,
      image: images[3] || images[1] || images[0]
    }
  ].filter(card => card.text);
}
function getUsedPracticalGroups(experienceCards) {
  return new Set(
    experienceCards.flatMap(card => card.usedGroups || [])
  );
}

function renderPracticalInfo(place, usedGroups = new Set()) {
  const groups = [
    { title: "Service Options", values: place.serviceOptions || [] },
    { title: "Offerings", values: place.offerings || [] },
    { title: "Dining Options", values: place.diningOptions || [] },
    { title: "Planning", values: place.planning || [] },
    { title: "Payments", values: place.payments || [] },
    { title: "Accessibility", values: place.accessibility || [] },
    { title: "Children", values: place.children || [] },
    { title: "Parking", values: place.parking || [] },
    { title: "Pets", values: place.pets || [] }
  ];

  return groups
    .filter(group => group.values.length > 0)
    .filter(group => !usedGroups.has(group.title))
    .map(group => `
      <div class="info-list-card">
        <h3>${group.title}</h3>
        <p>${group.values.join(" · ")}</p>
      </div>
    `).join("");
}

function getConnectedBeachStyle(place) {
  const image =
    place.connectedBeachHeroImage ||
    place.beachHeroImage ||
    place.beachImage ||
    place.heroImage ||
    (place.images || [])[0] ||
    "";

  if (!image) return "";

  return `
    background-image:
      linear-gradient(135deg, rgba(0,119,255,0.72), rgba(0,198,255,0.36)),
      url('${image}')
  `;
}

function renderPlace(place) {
  const page = document.getElementById("place-page");
  const title = getTitle(place);
  const description = getDescription(place);

  const ctaLabel = place.type === "beach_bar"
    ? "RESERVE SUNBEDS"
    : "BOOK A TABLE";

  const images = place.images && place.images.length > 0
    ? place.images
    : [place.heroImage].filter(Boolean);

  const experienceCards = buildExperienceCards(place);
  const usedPracticalGroups = getUsedPracticalGroups(experienceCards);
  const practicalInfo = renderPracticalInfo(place, usedPracticalGroups);
const beachDayCards = buildBeachDayCards(place);
  page.innerHTML = `
    <article class="place-page-premium ${place.type === "beach_bar" ? "beach-bar-page" : "restaurant-page"}">

      <section class="place-hero premium-hero">
        <div class="hero-floating-actions">
          <a href="index.html" class="hero-floating-btn" aria-label="Back">
            ←
          </a>

          <button class="hero-floating-btn" id="shareBtn" aria-label="Share">
            ${shareSvg()}
          </button>
        </div>

        <div class="place-carousel" id="placeCarousel">
          ${images.map((image, index) => `
            <div class="place-slide">
              <img
                src="${image}"
                alt="${title}"
                loading="${index === 0 ? "eager" : "lazy"}"
              />
            </div>
          `).join("")}
        </div>

        <div class="carousel-dots" id="carouselDots">
          ${images.map((_, index) => `
            <div class="carousel-dot ${index === 0 ? "active" : ""}"></div>
          `).join("")}
        </div>
      </section>

      <section class="place-header hero-info-card premium-main-card">
        <div class="hero-title-row">
          <div class="hero-title-block">
            <h1>${title}</h1>

            <div class="hero-subtitle">
              ${getSubtitle(place)}
            </div>
          </div>

          <button
            class="favorite-btn hero-favorite-btn"
            id="favoriteBtn"
            aria-label="Favorite"
          >
            ♡
          </button>
        </div>

        <div class="premium-meta-line">
          ${place.rating ? `<span>⭐ ${place.rating}</span>` : ""}
          ${place.price ? `<span>${place.price}</span>` : ""}
          ${place.zone ? `<span>${place.zone}</span>` : ""}
        </div>

        ${place.beachSlug ? `
          <a href="beach.html?id=${place.beachSlug}" class="hero-beach-line">
            Near ${formatBeachName(place.beachSlug)}
          </a>
        ` : ""}

        <div class="today-card" onclick="toggleOpeningHours()">
          <div>
            <small>${lang === "ro" ? "Astăzi" : "Today"}</small>
            <strong>${getTodayLabel(place)}</strong>
          </div>

          <span>▼</span>
        </div>

        <div class="hours-list premium-hours-list" id="openingHoursList">
          ${renderOpeningHours(place)}
        </div>
      </section>

      <section class="premium-cta-section">
        <button class="cta-btn premium-book-btn" id="bookBtn">
          ${ctaLabel}
        </button>

        ${place.menuImages && place.menuImages.length > 0 ? `
          <button class="menu-btn premium-menu-btn" id="openMenuBtn">
            VIEW MENU
          </button>
        ` : ""}
      </section>

      <section class="reservation-form premium-reservation-form" id="reservationForm">
        <input type="text" id="reserveName" placeholder="Your Name">
        <input type="date" id="reserveDate">

        <select id="reserveHour">
          <option value="">Select Hour</option>
          <option>09:00</option>
          <option>09:30</option>
          <option>10:00</option>
          <option>10:30</option>
          <option>11:00</option>
          <option>11:30</option>
          <option>11:00</option>
          <option>11:30</option>
          <option>12:00</option>
          <option>12:30</option>
          <option>13:00</option>
          <option>13:30</option>
          <option>14:00</option>
          <option>14:30</option>
          <option>15:00</option>
          <option>15:30</option>
          <option>16:00</option>
          <option>16:30</option>
          <option>17:00</option>
          <option>17:30</option>
          <option>18:00</option>
          <option>18:30</option>
          <option>19:00</option>
          <option>19:30</option>
          <option>20:00</option>
          <option>20:30</option>
          <option>21:00</option>
          <option>21:30</option>
          <option>22:00</option>
          <option>22:30</option>
          <option>23:00</option>
        </select>

        <div class="guests-selector">
          <button type="button" id="minusGuests">−</button>
          <span id="guestsCount">2</span>
          <button type="button" id="plusGuests">+</button>
        </div>

        <button class="send-reservation-btn" id="sendReservationBtn">
          Send via WhatsApp
        </button>
      </section>

      <section class="premium-direction-row">
        <a href="${mapsUrl(place)}" target="_blank" class="take-me-there-btn">
          <span>${directionSvg()}</span>
          <strong>TAKE ME THERE</strong>
        </a>
      </section>

     
<section class="description-section premium-about-section">
  <h2 class="section-title">About ${title}</h2>

  <p class="place-description collapsed" id="placeDescription">
    ${description}
  </p>

  <button class="see-more-btn" id="seeMoreBtn">
    See More
  </button>
</section>

${beachDayCards.length ? `
  <section class="beach-day-section">
    <div class="beach-day-header">
      <div>
        <span>Beach Bar Premium</span>
        <h2>Your Beach Day</h2>
        <p>Sunbeds, drinks, food and atmosphere — all in one seaside experience.</p>
      </div>
    </div>

    <div class="beach-day-grid">
      ${beachDayCards.map(card => `
        <div class="beach-day-card" style="background-image:url(&quot;${card.image}&quot;)">
          <div class="beach-day-overlay"></div>

          <div class="beach-day-content">
            <span class="beach-day-kicker">${card.kicker}</span>
            <strong class="beach-day-big">${card.big}</strong>
            <h3>${card.title}</h3>
            <p>${card.text}</p>
          </div>
        </div>
      `).join("")}
    </div>
  </section>
` : ""}

${place.type !== "beach_bar" ? `
        <section
          class="stay-experience premium-experience"
          style="background-image:url('${place.heroImage || images[0]}')"
        >
          <div class="experience-header">
            <div>
              <div class="experience-kicker">
                ${place.type === "beach_bar"
                  ? "Beach Bar Experience"
                  : "Restaurant Experience"}
              </div>

              <h2>Why people come here</h2>

              <p>
                Built only from the official place details already stored in Halkidiki Explorer.
              </p>
            </div>

            ${place.rating ? `
              <div class="experience-score">
                <span>${place.rating}</span>
                <small>Google rating</small>
              </div>
            ` : ""}
          </div>

          <div class="experience-grid premium-experience-grid">
            ${experienceCards.map(card => `
              <div
                class="experience-card premium-experience-card"
                style="background-image:url('${card.image || images[0]}')"
              >
                <span>${card.emoji}</span>
                <h3>${card.title}</h3>
                <p>${card.text}</p>
              </div>
            `).join("")}
          </div>
        </section>
      ` : ""}



      ${place.beachSlug ? `
        <section class="stay-hero-panel premium-connected-section">
          <div class="connected-beach-card premium-connected-beach-card" style="${getConnectedBeachStyle(place)}">
            <div class="beach-card-content">
              <div class="beach-card-label">
                Connected Beach
              </div>

              <h2>${formatBeachName(place.beachSlug)}</h2>

              <p>
                This place is connected with ${formatBeachName(place.beachSlug)} inside Halkidiki Explorer.
              </p>

              <button onclick="window.location.href='beach.html?id=${place.beachSlug}'">
                View Beach
              </button>
            </div>
          </div>
        </section>
      ` : ""}

      ${practicalInfo ? `
        <section class="premium-practical-section">
          <h2 class="section-title">Useful Information</h2>

          <div class="info-list-grid">
            ${practicalInfo}
          </div>
        </section>
      ` : ""}

      <div class="menu-modal" id="menuModal">
        <button class="close-menu" id="closeMenuBtn">✕</button>

        <div class="menu-carousel" id="menuCarousel">
          ${(place.menuImages || []).map(image => `
            <div class="menu-slide">
              <img src="${image}" loading="lazy" alt="Menu image">
            </div>
          `).join("")}
        </div>
      </div>

      <footer class="place-owner-footer">
        <div class="place-owner-footer-inner">
          <div>
            <h2>${title}</h2>
            ${place.displayAddress ? `<p>${place.displayAddress}</p>` : ""}
          </div>

          <div class="owner-footer-actions">
            ${place.phone ? `
              <a href="tel:${place.phone}">
                ${phoneSvg()}
                Call
              </a>
            ` : ""}

            <a href="${mapsUrl(place)}" target="_blank">
              ${directionSvg()}
              Directions
            </a>

            <button id="footerShareBtn">
              ${shareSvg()}
              Share
            </button>
          </div>

          <div class="powered-by">
            Powered by <strong>Halkidiki Explorer</strong>
          </div>
        </div>
      </footer>

    </article>
  `;
}

function setupFavorite(place) {
  const favoriteBtn = document.getElementById("favoriteBtn");
  if (!favoriteBtn) return;

  let favorites = JSON.parse(
    localStorage.getItem("favorites") || "[]"
  );

  const title = getTitle(place);
  const image =
    place.heroImage ||
    place.images?.[0] ||
    "";

  function isFavorite() {
    return favorites.some(item => item.id === place.id);
  }

  function updateFavoriteIcon() {
    const active = isFavorite();

    favoriteBtn.innerHTML = active ? "❤️" : "♡";
    favoriteBtn.classList.toggle("active", active);
  }

  updateFavoriteIcon();

  favoriteBtn.addEventListener("click", () => {
    if (isFavorite()) {
      favorites = favorites.filter(item => item.id !== place.id);
    } else {
      favorites.push({
        id: place.id,
        title: title,
        image: image,
        rating: place.rating || "-",
        type: place.type || "place"
      });
    }

    localStorage.setItem(
      "favorites",
      JSON.stringify(favorites)
    );

    updateFavoriteIcon();
  });
}

function setupShare(place) {
  const buttons = [
    document.getElementById("shareBtn"),
    document.getElementById("footerShareBtn")
  ].filter(Boolean);

  const title = getTitle(place);
  const url = `${window.location.origin}/place/${place.id}/`;

  async function sharePlace() {
    const shareData = {
      title,
      text: `${title} · Halkidiki Explorer`,
      url
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      alert("Link copied");
      return;
    }

    prompt("Copy this link:", url);
  }

  buttons.forEach(button => {
    button.addEventListener("click", sharePlace);
  });
}

function setupHeroAutoplay() {
  const carousel = document.getElementById("placeCarousel");
  const dots = document.querySelectorAll(".carousel-dot");

  if (!carousel || dots.length <= 1) return;

  let userPaused = false;
  let resumeTimer = null;

  function updateDots() {
    const index = Math.round(carousel.scrollLeft / carousel.clientWidth);

    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i === index);
    });
  }

  function pauseAutoplay() {
    userPaused = true;
    clearTimeout(resumeTimer);

    resumeTimer = setTimeout(() => {
      userPaused = false;
    }, 9000);
  }

  carousel.addEventListener("scroll", updateDots);
  carousel.addEventListener("pointerdown", pauseAutoplay);
  carousel.addEventListener("touchstart", pauseAutoplay, { passive: true });
  carousel.addEventListener("wheel", pauseAutoplay, { passive: true });

  setInterval(() => {
    if (userPaused) return;

    const current = Math.round(carousel.scrollLeft / carousel.clientWidth);
    const next = current + 1 >= dots.length ? 0 : current + 1;

    carousel.scrollTo({
      left: next * carousel.clientWidth,
      behavior: "smooth"
    });
  }, 5000);
}

function setupReservation(place) {
  const ctaBtn = document.getElementById("bookBtn");
  const reservationForm = document.getElementById("reservationForm");

  if (!ctaBtn || !reservationForm) return;

  ctaBtn.addEventListener("click", () => {
    reservationForm.classList.toggle("active");

    reservationForm.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  });

  const minus = document.getElementById("minusGuests");
  const plus = document.getElementById("plusGuests");
  const guestsCount = document.getElementById("guestsCount");
  const sendBtn = document.getElementById("sendReservationBtn");

  let guests = 2;

  minus.addEventListener("click", () => {
    if (guests > 1) guests--;
    guestsCount.innerText = guests;
  });

  plus.addEventListener("click", () => {
    guests++;
    guestsCount.innerText = guests;
  });

  sendBtn.addEventListener("click", () => {
    const name = document.getElementById("reserveName").value;
    const date = document.getElementById("reserveDate").value;
    const hour = document.getElementById("reserveHour").value;

    const label = place.type === "beach_bar"
      ? "Sunbeds"
      : "Guests";

    const message = `
Hello,
I would like to make a reservation at ${getTitle(place)}.

Name: ${name}
Date: ${date}
Hour: ${hour}
${label}: ${guests}
────────────────────
This reservation request was sent through the Halkidiki Explorer ecosystem.


`;

    window.open(
      `https://wa.me/${(place.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
  });
}

function setupMenuModal() {
  const menuModal = document.getElementById("menuModal");
  const openMenuBtn = document.getElementById("openMenuBtn");
  const closeMenuBtn = document.getElementById("closeMenuBtn");

  if (!menuModal || !openMenuBtn || !closeMenuBtn) return;

  openMenuBtn.addEventListener("click", () => {
    menuModal.classList.add("active");
    document.body.style.overflow = "hidden";
  });

  closeMenuBtn.addEventListener("click", () => {
    menuModal.classList.remove("active");
    document.body.style.overflow = "";
  });
}

function setupDescription() {
  const descriptionEl = document.getElementById("placeDescription");
  const button = document.getElementById("seeMoreBtn");

  if (!descriptionEl || !button) return;

  button.addEventListener("click", () => {
    descriptionEl.classList.toggle("collapsed");

    button.innerText = descriptionEl.classList.contains("collapsed")
      ? "See More"
      : "See Less";
  });
}

function toggleOpeningHours() {
  const list = document.getElementById("openingHoursList");
  if (!list) return;

  list.classList.toggle("active");
}

loadPlace().catch(error => {
  console.error(error);

  document.getElementById("place-page").innerHTML = `
    <div style="
      padding:40px;
      color:red;
      font-size:22px;
    ">
      ${error}
    </div>
  `;
});