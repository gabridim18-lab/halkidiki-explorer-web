async function loadWhatToDo() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const id =
    params.get("id");

  const response =
    await fetch(

`https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data/what-to-do/${id}/index.json`

    );

  const data =
    await response.json();

  document.getElementById(
    "title"
  ).innerText =
    data.titleEn;

  document.getElementById(
    "category"
  ).innerText =
    data.categoryEn;

  document.getElementById(
    "description"
  ).innerText =
    data.descriptionEn;

  document.getElementById(
    "address"
  ).innerText =
    data.address || "-";

  document.getElementById(
    "hours"
  ).innerText =
    data.hoursEn || "-";

  document.getElementById(
    "price"
  ).innerText =
    data.price || "-";

  const gallery =
    document.getElementById(
      "gallery"
    );

  const imageBase =

`https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data/what-to-do/${id}/images/`;

  data.images.forEach(image => {

    gallery.innerHTML += `

      <img
        src="${imageBase}${image}"
      >

    `;

  });

  document.getElementById(
    "mapBtn"
  ).onclick = () => {

    const lat =
      data.coordinates?.lat;

    const lon =
      data.coordinates?.lon;

    window.open(

      `https://www.google.com/maps?q=${lat},${lon}`,

      "_blank"

    );

  };

}
function toggleDescription() {

  const desc =
    document.getElementById(
      "description"
    );

  desc.classList.toggle(
    "collapsed"
  );

}
function toggleFavorite() {

  alert(
    "Favorites system coming soon ❤️"
  );

}
loadWhatToDo();