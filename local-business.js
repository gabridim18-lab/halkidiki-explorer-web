async function loadBusiness() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const businessId =
    params.get("id");

  const response =
    await fetch(

`https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data/local-businesses/${businessId}/index.json`

    );

  const data =
    await response.json();

  // TITLE

  document.getElementById(
    "businessTitle"
  ).innerText =
    data.titleEn;

  // CATEGORY

  document.getElementById(
    "businessCategory"
  ).innerText =
    data.categoryEn;

  // DESCRIPTION

const description =
  document.getElementById("businessDescription");

description.textContent = data.descriptionEn;

if (data.descriptionEn.length > 300) {

  description.classList.add("collapsed");

  description.insertAdjacentHTML(
    "afterend",
    `<button id="toggleDescription" class="see-more-btn">
      Show more
    </button>`
  );

  document
    .getElementById("toggleDescription")
    .addEventListener("click", function () {

      description.classList.toggle("collapsed");

      this.textContent =
        description.classList.contains("collapsed")
          ? "Show more"
          : "Show less";

    });

}

  // GALLERY

  const gallery =
    document.getElementById(
      "gallery"
    );

  const imageBase =

`https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data/local-businesses/${businessId}/images/`;

  const allImages = [
  data.heroImage,
  ...(data.images || [])
].filter(Boolean);

allImages.forEach(image => {

    console.log(imageBase + image);

    gallery.innerHTML += `

      <img
        src="${imageBase}${image}"
      >

    `;

  });

  // ---------- GALLERY DOTS + AUTOPLAY ----------

const dotsContainer =
  document.getElementById("galleryDots");

allImages.forEach((image, index) => {

  const dot =
    document.createElement("div");

  dot.className = "gallery-dot";

  if (index === 0) {
    dot.classList.add("active");
  }

  dotsContainer.appendChild(dot);

});

const dots =
  dotsContainer.querySelectorAll(".gallery-dot");

let currentSlide = 0;

function goToSlide(index) {

  currentSlide = index;

  gallery.scrollTo({

    left: gallery.clientWidth * index,

    behavior: "smooth"

  });

  dots.forEach((dot, i) => {

    dot.classList.toggle(
      "active",
      i === index
    );

  });

}

setInterval(() => {

  currentSlide++;

  if (currentSlide >= allImages.length) {

    currentSlide = 0;

  }

  goToSlide(currentSlide);

}, 5000);

  // INFO GRID

  loadBusinessInfo(data);

  // CONTACT FORM

  if (data.booking) {

    document.getElementById(
      "contactSection"
    ).style.display =
      "block";

  }

  // SAVE GLOBAL

  window.currentBusiness =
    data;
populateBookingTimes(data);
    setupBusinessActions(data);
renderOpeningHours(data);
setupBusinessShare(data, businessId, imageBase, allImages);
}


  function loadBusinessInfo(data) {

  document.getElementById("businessAddress").textContent =
    data.address || "Not available";

  document.getElementById("businessDistance").textContent =
    data.distance || "Not available";

}
function populateBookingTimes(business) {

  const select =
    document.getElementById("bookingTime");

  if (!select || !business.hours?.en)
    return;

  // Exemplu:
  // "Daily: 11:00 - 20:30"

  const match =
    business.hours.en.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);

  if (!match)
    return;

  const start = match[1];
  const end = match[2];

  const [startHour, startMinute] =
    start.split(":").map(Number);

  const [endHour, endMinute] =
    end.split(":").map(Number);

  const startDate = new Date();
  startDate.setHours(startHour, startMinute, 0, 0);

  const endDate = new Date();
  endDate.setHours(endHour, endMinute, 0, 0);

  select.innerHTML = "";

  while (startDate <= endDate) {

    const h =
      String(startDate.getHours()).padStart(2, "0");

    const m =
      String(startDate.getMinutes()).padStart(2, "0");

    const time = `${h}:${m}`;

    select.innerHTML += `
      <option value="${time}">
        ${time}
      </option>
    `;

    startDate.setMinutes(
      startDate.getMinutes() + 30
    );

  }

}

function sendBusinessWhatsApp() {

  const business =
    window.currentBusiness;

  const name =
    document.getElementById(
      "clientName"
    ).value;

  const date =
    document.getElementById(
      "bookingDate"
    ).value;

  const time =
    document.getElementById(
      "bookingTime"
    ).value;

  const message =
    document.getElementById(
      "bookingMessage"
    ).value;

  const text =

`Hello!

I'm writing to request a reservation at ${business.name}.

My name is ${name}

Date:
${date}

Time:
${time}

Message:
${message}
----------------------------------
This message was sent from the Halkidiki Explorer ecosystem for:
${business.categoryEn}`;

  const url =

`https://wa.me/${business.whatsapp.replace("+", "")}?text=${encodeURIComponent(text)}`;

  window.open(
    url,
    "_blank"
  );

}
function setupBusinessActions(data) {

  const requestBtn =
    document.getElementById("requestBtn");

  const contactSection =
    document.getElementById("contactSection");

  requestBtn.onclick = function () {

    const form =
        contactSection.querySelector(".booking-form");

    if (contactSection.style.display === "block") {

        contactSection.style.display = "none";
        form.style.display = "none";

    } else {

        contactSection.style.display = "block";
        form.style.display = "flex";

        contactSection.scrollIntoView({

            behavior: "smooth",
            block: "start"

        });

    }

};

  document.getElementById("takeMeThereBtn").onclick = function () {

    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lon}`,
      "_blank"
    );

  };

  const websiteBtn =
  document.getElementById("businessWebsiteBtn");

if (data.website && data.website.trim() !== "") {

  websiteBtn.href = data.website;
  websiteBtn.style.display = "flex";

} else {

  websiteBtn.style.display = "none";

}

}

function renderOpeningHours(data) {

  const statusEl =
    document.getElementById("businessHoursStatus");

  const detailsEl =
    document.getElementById("businessHoursDetails");

  const toggleBtn =
    document.getElementById("hoursToggleBtn");

  const hoursText =
    data.hours?.en || "Opening hours not available";

  const now =
    new Date();

  const day =
    now.getDay();

  const match =
    hoursText.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);

  let isOpen = false;
  let opensAt = "";
  let closesAt = "";

  if (match) {

    opensAt = match[1];
    closesAt = match[2];

    const currentMinutes =
      now.getHours() * 60 + now.getMinutes();

    const openMinutes =
      Number(opensAt.split(":")[0]) * 60 +
      Number(opensAt.split(":")[1]);

    const closeMinutes =
      Number(closesAt.split(":")[0]) * 60 +
      Number(closesAt.split(":")[1]);

    const openToday =
      hoursText.includes("Mo - Sa")
        ? day >= 1 && day <= 6
        : true;

    isOpen =
      openToday &&
      currentMinutes >= openMinutes &&
      currentMinutes <= closeMinutes;

  }

  if (isOpen) {

    statusEl.innerHTML = `
      <span class="status-dot open"></span>
      <strong>Open now until ${closesAt}</strong>
    `;

  } else {

    statusEl.innerHTML = `
      <span class="status-dot closed"></span>
      <strong>Closed • Opens tomorrow at ${opensAt || "09:00"}</strong>
    `;

  }

  detailsEl.innerText =
    hoursText;

  toggleBtn.onclick = function () {

    detailsEl.classList.toggle("active");

    toggleBtn.innerText =
      detailsEl.classList.contains("active")
        ? "⌃"
        : "⌄";

  };

}

function setupBusinessShare(data, businessId, imageBase, allImages) {

  const shareBtn =
    document.getElementById("shareBusinessBtn");

  if (!shareBtn) return;

  const image =
    allImages?.[0]
      ? imageBase + allImages[0]
      : "";

  const shareUrl =
  `${window.location.origin}/local-business/${businessId}/`;

  shareBtn.onclick = async function () {

    const shareData = {
      title: data.titleEn,
      text: `${data.titleEn} • ${data.categoryEn} on Halkidiki Explorer`,
      url: shareUrl
    };

    if (navigator.share) {

      try {
        await navigator.share(shareData);
      } catch (error) {}

    } else {

      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied!");
    }

  };

}
loadBusiness();