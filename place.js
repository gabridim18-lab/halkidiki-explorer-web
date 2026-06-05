const params = new URLSearchParams(window.location.search)

const id = params.get("id")

const lang = localStorage.getItem("lang") || "en"

async function loadPlace() {

  const indexResponse = await fetch(
  "https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data/restaurants/restaurants-index.json"
)

  const indexData = await indexResponse.json()

  const found = indexData.find(
    item => item.id === id
  )

  if (!found) {

    document.getElementById("place-page").innerHTML = `
      <div class="error-message">
        Place not found
      </div>
    `

    return
  }

  const response = await fetch(
  `https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data/restaurants/${found.id}/index.json`
)
  const place = await response.json()

  renderPlace(place)

const favoriteBtn =
  document.getElementById(
    "favoriteBtn"
  )

let favorites =
  JSON.parse(
    localStorage.getItem(
      "favorite_places"
    ) || "[]"
  )

const isFavorite =
  favorites.includes(place.id)

updateFavoriteIcon()

favoriteBtn.addEventListener(
  "click",
  () => {

    if(
      favorites.includes(place.id)
    ) {

      favorites =
        favorites.filter(
          id => id !== place.id
        )

    } else {

      favorites.push(place.id)

    }

    localStorage.setItem(
      "favorite_places",
      JSON.stringify(favorites)
    )

    updateFavoriteIcon()

  }
)

function updateFavoriteIcon() {

  const active =
    favorites.includes(place.id)

  favoriteBtn.innerHTML =
    active ? "❤️" : "♡"

  favoriteBtn.classList.toggle(
    "active",
    active
  )

}


}

function renderPlace(place) {

   function formatBeachName(slug) {

  return slug
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, l => l.toUpperCase());

}
function getPlaceSubtitle(place) {

  const cuisine =
    place.cuisineTypes &&
    place.cuisineTypes.length > 0
      ? place.cuisineTypes[0].replaceAll("_", " ")
      : "";

  if (place.type === "beach_bar") {
    return cuisine
      ? `${cuisine} beach bar`
      : "Beach bar";
  }

  return cuisine
    ? `${cuisine} restaurant`
    : "Restaurant";

}
function getVibeTag(place) {

  const vibes = [

    "dj_sets",
    "live_music",
    "party",
    "lounge",
    "chill"

  ]

  const found =
    vibes.find(v =>

      (place.musicStyles || [])
        .includes(v)

    )

  if(!found)
    return ""

  const labels = {

    dj_sets: "🎧 DJ Sets",
    live_music: "🎵 Live Music",
    party: "🥂 Party",
    lounge: "🍸 Lounge",
    chill: "🌴 Chill"

  }

  return `

    <div class="vibe-pill">

      ${labels[found]}

    </div>

  `
}
function getOpeningHoursList(place) {

  if (
    place.openingHours &&
    place.openingHours.length > 0
  ) {
    return place.openingHours;
  }

  if (!place.hoursEn) {
    return [];
  }

  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
  ];

  return days.map(day => {

    const regex =
      new RegExp(`${day}\\s*:?\\s*([^;]+)`, "i");

    const match =
      place.hoursEn.match(regex);

    if (!match) return null;

    const value =
      match[1].trim();

    const closed =
      value.toLowerCase().includes("closed");

    return {
      day: day,
      closed: closed,
      labelEn: closed ? "Closed" : value.replace(" - ", "")
    };

  }).filter(Boolean);

}

function getTodayHours(place) {

  const list =
    getOpeningHoursList(place);

  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];

  const todayName =
    days[new Date().getDay()];

  const today =
    list.find(item =>
      item.day === todayName
    );

  if (!today) return "Hours not available";

  return today.closed
    ? "Closed"
    : today.labelEn;

}

function renderOpeningHours(place) {

  const list =
    getOpeningHoursList(place);

  if (list.length === 0) {
    return "";
  }

  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ];

  const todayIndex =
    new Date().getDay();

  const orderedDays =
    [
      ...days.slice(todayIndex + 1),
      ...days.slice(0, todayIndex + 1)
    ];

  return orderedDays.map(day => {

    const item =
      list.find(x => x.day === day);

    if (!item) return "";

    return `

      <div class="hours-row">

        <div class="hours-day">
          ${item.day}
        </div>

        <div class="hours-time">
          ${item.closed ? "Closed" : item.labelEn}
        </div>

      </div>

    `;

  }).join("");

}


function buildFeatureTags(place) {

  const allFeatures = [

    ...(place.features || []),
    ...(place.musicStyles || [])

  ]

  const labels = {

    cocktails: {
      emoji: "🍸",
      text: "Cocktails"
    },

    sea_view: {
      emoji: "🌊",
      text: "Sea View"
    },

    sunset_view: {
      emoji: "🌅",
      text: "Sunset View"
    },

    pet_friendly: {
      emoji: "🐶",
      text: "Pet Friendly"
    },

    dj_sets: {
      emoji: "🎧",
      text: "DJ Sets"
    },

    live_music: {
      emoji: "🎵",
      text: "Live Music"
    },

    party: {
      emoji: "🥂",
      text: "Party"
    },

    lounge: {
      emoji: "🍾",
      text: "Lounge"
    },

    chill: {
      emoji: "🌴",
      text: "Chill"
    },

    parking: {
      emoji: "🅿️",
      text: "Parking"
    },

    family: {
      emoji: "👨‍👩‍👧‍👦",
      text: "Family Friendly"
    }

  }

  return allFeatures.map(feature => {

    const data = labels[feature]

    if(!data)
      return ""

    return `

      <div class="feature-tag">

        <span class="feature-emoji">

          ${data.emoji}

        </span>

        <span class="feature-text">

          ${data.text}

        </span>

      </div>

    `

  }).join("")

}
function buildWhyPeopleCome(place) {

  const cards = []

  if ((place.features || []).includes("sunset_view")) {
    cards.push({
      emoji: "🌅",
      title: "Sunset Views",
      text: "One of the best sunset spots",
      image: place.images?.[0]
    })
  }

  if ((place.features || []).includes("cocktails")) {
    cards.push({
      emoji: "🍸",
      title: "Premium Cocktails",
      text: "Relax with drinks by the sea",
      image: place.images?.[1] || place.images?.[0]
    })
  }

  if ((place.musicStyles || []).includes("party")) {
    cards.push({
      emoji: "🎧",
      title: "Party Atmosphere",
      text: "Music and social vibes",
      image: place.images?.[2] || place.images?.[0]
    })
  }

  if ((place.features || []).includes("sea_view")) {
    cards.push({
      emoji: "🌊",
      title: "Waterfront Location",
      text: "Directly connected to the sea",
      image: place.images?.[3] || place.images?.[0]
    })
  }

  if ((place.features || []).includes("pet_friendly")) {
    cards.push({
      emoji: "🐶",
      title: "Pet Friendly",
      text: "Visitors with pets are welcome",
      image: place.images?.[0]
    })
  }

  if ((place.features || []).includes("parking")) {
    cards.push({
      emoji: "🅿️",
      title: "Easy Parking",
      text: "Convenient access nearby",
      image: place.images?.[0]
    })
  }

  return cards.slice(0, 4)
}


function getSocialLabel(place) {

  if(place.instagram)
    return "Instagram"

  if(place.facebook)
    return "Facebook"

  return "Website"

}

function getSocialSvg(place) {

  if(place.instagram) {

    return `

      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >

        <rect
          x="2"
          y="2"
          width="20"
          height="20"
          rx="5"
        />

        <path
          d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"
        />

        <line
          x1="17.5"
          y1="6.5"
          x2="17.51"
          y2="6.5"
        />

      </svg>

    `
  }

  if(place.facebook) {

    return `

      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >

        <path
          d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"
        />

      </svg>

    `
  }

  return `

    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >

      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>

    </svg>

  `
}

  const page = document.getElementById("place-page")

  const socialLink =
    place.instagram ||
    place.facebook ||
    place.website ||
    ""

  const socialLabel =
    place.instagram
      ? "Instagram"
      : place.facebook
      ? "Facebook"
      : "Website"

  const ctaLabel =
    place.type === "beach_bar"
      ? "RESERVE SUNBEDS"
      : "BOOK A TABLE"

  const title =
    lang === "ro"
      ? place.titleRo
      : place.titleEn

      const description =
    lang === "ro"
      ? place.descriptionRo
      : place.descriptionEn

  page.innerHTML = `

    <section class="place-hero">

      <div class="place-carousel" id="placeCarousel">

        ${place.images.map((image, index) => `

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

        ${place.images.map((_, index) => `

          <div class="carousel-dot ${index === 0 ? "active" : ""}"></div>

            `).join("")}

      </div>

    </section>

   <section class="place-header hero-info-card">

  <div class="hero-title-row">

    <div class="hero-title-block">

      <h1>
        ${title}
      </h1>

      <div class="hero-subtitle">
        ${getPlaceSubtitle(place)}
      </div>

    </div>

    <button
      class="favorite-btn hero-favorite-btn"
      id="favoriteBtn"
    >
      ♡
    </button>

  </div>

  <a
  href="beach.html?id=${place.beachSlug}"
  class="hero-beach-line"
>
  ${formatBeachName(place.beachSlug)}
</a>

 <div class="hero-highlights-text">
  ${(place.features || [])
    .filter(x => x !== "restaurant")
    .slice(0, 3)
    .map(x => formatFeatureLabel(x))
    .join(" · ")}
</div>

  <div class="hero-hours-wrap">

    <div class="hours-box">

      <div
        class="hours-today"
        onclick="toggleOpeningHours()"
      >
        <span>
          Today · ${getTodayHours(place)}
        </span>

        <span>
          ▼
        </span>
      </div>

      <div
        class="hours-list"
        id="openingHoursList"
      >
        ${renderOpeningHours(place)}
      </div>

    </div>

  </div>

</section>

    <section class="action-buttons">

  <a
    href="tel:${place.phone}"
    class="action-item"
  >

    <div class="action-icon">

      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >

        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72c.12.9.32 1.78.59 2.62a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.46-1.11a2 2 0 0 1 2.11-.45c.84.27 1.72.47 2.62.59A2 2 0 0 1 22 16.92z"/>

      </svg>

    </div>

    <span>Call</span>

  </a>

  <a
    href="https://maps.google.com/?q=${place.lat},${place.lon}"
    target="_blank"
    class="action-item"
  >

    <div class="action-icon">

      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >

        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>

      </svg>

    </div>

    <span>Directions</span>

  </a>

  ${socialLink ? `

    <a
      href="${socialLink}"
      target="_blank"
      class="action-item"
    >

      <div class="action-icon">

        ${getSocialSvg(place)}

      </div>

      <span>

        ${getSocialLabel(place)}

      </span>

    </a>

  ` : ""}

</section>

    <section class="cta-section">

      <button class="cta-btn">
        ${ctaLabel}
      </button>

      ${place.menuImages.length > 0 ? `

       <button
  class="menu-btn"
  id="openMenuBtn"
>

  VIEW MENU

</button>

      ` : ""}

    </section>

    <section
  class="reservation-form"
  id="reservationForm"
>

  <input
    type="text"
    id="reserveName"
    placeholder="Your Name"
  >

  <input
    type="date"
    id="reserveDate"
  >

 <select id="reserveHour">

  <option value="">
    Select Hour
  </option>

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

  <button
    type="button"
    id="minusGuests"
  >

    −

  </button>

  <span id="guestsCount">

    2

  </span>

  <button
    type="button"
    id="plusGuests"
  >

    +

  </button>

</div>

  <button
    class="send-reservation-btn"
    id="sendReservationBtn"
  >

    Send via WhatsApp

  </button>

</section>

<div
  class="menu-modal"
  id="menuModal"
>

  <button
    class="close-menu"
    id="closeMenuBtn"
  >

    ✕

  </button>

  <div
    class="menu-carousel"
    id="menuCarousel"
  >

    ${(place.menuImages || []).map(image => `

      <div class="menu-slide">

        <img
          src="${image}"
          loading="lazy"
        >

      </div>

    `).join("")}

  </div>

</div>

<section class="place-content">

  <h2 class="section-title">
    Why People Come Here
  </h2>

  <div class="business-info-grid">

    ${buildWhyPeopleCome(place).map(card => `

      <div
        class="business-info-card"
        style="background-image:url('${card.image}')"
      >

        <div class="business-info-overlay">

          <div class="business-info-title">

            ${card.emoji} ${card.title}

          </div>

          <div class="business-info-text">

            ${card.text}

          </div>

        </div>

      </div>

    `).join("")}

  </div>

</section>

    <section class="description-section">

      <p class="place-description collapsed" id="placeDescription">
        ${description}
      </p>

      <button class="see-more-btn" id="seeMoreBtn">
        See More
      </button>

    </section>

  `

  const carousel =
    document.getElementById("placeCarousel")

  carousel.addEventListener(
    "scroll",
    () => {

      const index = Math.round(
        carousel.scrollLeft
        / carousel.clientWidth
      )

      document
        .querySelectorAll(".carousel-dot")
        .forEach((dot, i) => {

          dot.classList.toggle(
            "active",
            i === index
          )

        })

    }
  )

  const descriptionEl =
    document.getElementById("placeDescription")

  const button =
    document.getElementById("seeMoreBtn")

    const ctaBtn =
  document.querySelector(
    ".cta-btn"
  )

const reservationForm =
  document.getElementById(
    "reservationForm"
  )

ctaBtn.addEventListener(
  "click",
  () => {

    reservationForm.classList.toggle(
      "active"
    )

    reservationForm.scrollIntoView({

      behavior: "smooth",
      block: "center"

    })

  }
)

const menuModal =
  document.getElementById(
    "menuModal"
  )

const openMenuBtn =
  document.getElementById(
    "openMenuBtn"
  )

const closeMenuBtn =
  document.getElementById(
    "closeMenuBtn"
  )

if(openMenuBtn) {

  openMenuBtn.addEventListener(
    "click",
    () => {

      menuModal.classList.add(
        "active"
      )

      document.body.style.overflow =
        "hidden"

    }
  )

}

closeMenuBtn.addEventListener(
  "click",
  () => {

    menuModal.classList.remove(
      "active"
    )

    document.body.style.overflow =
      ""

  }
)

const sendBtn =




  document.getElementById(
    "sendReservationBtn"
  )

let guests = 2

const guestsCount =
  document.getElementById(
    "guestsCount"
  )

document
  .getElementById("minusGuests")
  .addEventListener(
    "click",
    () => {

      if(guests > 1)
        guests--

      guestsCount.innerText =
        guests

    }
  )

document
  .getElementById("plusGuests")
  .addEventListener(
    "click",
    () => {

      guests++

      guestsCount.innerText =
        guests

    }
  )

 sendBtn.addEventListener(
  "click",
  () => {

    const name =
      document.getElementById(
        "reserveName"
      ).value

    const date =
      document.getElementById(
        "reserveDate"
      ).value

    const hour =
      document.getElementById(
        "reserveHour"
      ).value

    const guestsValue = guests

    const label =
      place.type === "beach_bar"
        ? "Sunbeds"
        : "Guests"

    const message = `

Hello,
I would like to make a reservation at ${title}.

Name: ${name}

Date: ${date}

Hour: ${hour}

${label}: ${guestsValue}

`

    window.open(

`https://wa.me/${place.phone.replace(/\D/g,"")}?text=${encodeURIComponent(message)}`,

      "_blank"

    )

  }
)



  button.addEventListener(





    "click",
    () => {

         descriptionEl.classList.toggle(
        "collapsed"
      )

      button.innerText =
        descriptionEl.classList.contains(
          "collapsed"
        )
          ? "See More"
          : "See Less"

    }
  )
}

loadPlace().catch(error => {

  console.error(error)

  document.getElementById("place-page").innerHTML = `

    <div style="
      padding:40px;
      color:red;
      font-size:22px;
    ">

      ${error}

    </div>

  `

})
function toggleOpeningHours() {

  const list =
    document.getElementById("openingHoursList");

  if (!list) return;

  list.classList.toggle("active");

}
function getPlaceSubtitle(place) {

  const cuisine =
    place.cuisineTypes && place.cuisineTypes.length > 0
      ? place.cuisineTypes[0].replaceAll("_", " ")
      : "";

  if (cuisine) {
    return cuisine;
  }

  if (place.type === "beach_bar") {
    return "beach bar";
  }

  return "dining";
}

function formatFeatureLabel(feature) {

  const labels = {
    cocktails: "Cocktails",
    sea_view: "Sea View",
    sunset_view: "Sunset View",
    family_friendly: "Family Friendly",
    pet_friendly: "Pet Friendly",
    live_music: "Live Music",
    parking: "Parking",
    events: "Events"
  };

  return labels[feature] || feature.replaceAll("_", " ");

}