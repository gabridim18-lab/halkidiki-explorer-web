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

  document.getElementById(
    "businessDescription"
  ).innerText =
    data.descriptionEn;

  // GALLERY

  const gallery =
    document.getElementById(
      "gallery"
    );

  const imageBase =

`https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data/local-businesses/${businessId}/images/`;

  data.images.forEach(image => {

    console.log(imageBase + image);

    gallery.innerHTML += `

      <img
        src="${imageBase}${image}"
      >

    `;

  });

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

}

function loadBusinessInfo(data) {

  const grid =
    document.getElementById(
      "businessInfoGrid"
    );

 const items = [

  {
    title: "Working Hours",

    text:
      data.hours?.en,

    image:
      "beach-info/best_time.webp"
  },

  {
    title: "WhatsApp",

    text:
      data.whatsapp,

    image:
      "images/facilities/towels.webp"
  },

  {
    title: "Website",

    text:
      data.website || "No website",

    image:
      "images/maps_preview.webp"
  }

];

  items.forEach(item => {

    grid.innerHTML += `

      <div
        class="business-info-card"

        style="
          background-image:
          url('${item.image}');
        ">

        <div
          class="business-info-overlay">

          <div
            class="business-info-title">

            ${item.title}

          </div>

          <div
            class="business-info-text">

            ${item.text}

          </div>

        </div>

      </div>

    `;

  });

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

My name is ${name}

Date:
${date}

Time:
${time}

Message:
${message}`;

  const url =

`https://wa.me/${business.whatsapp.replace("+", "")}?text=${encodeURIComponent(text)}`;

  window.open(
    url,
    "_blank"
  );

}

loadBusiness();