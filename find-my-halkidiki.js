const STYLE_RULES = {

  "fine-sand": {
    beach: [
      "sand",
      "children",
      "gradual-entry"
    ]
  },

  "relax": {
    beach: [
      "relaxed",
      "low-occupancy",
      "hidden-gem"
    ]
  },

  "family": {
    beach: [
      "children",
      "gradual-entry",
      "organized"
    ],
    accommodation: [
      "family_friendly"
    ]
  },

  "sunset": {
    beach: [
      "sunset"
    ]
  },

  "crystal": {
    beach: [
      "clear-water",
      "snorkeling"
    ]
  },

  "beachlife": {
    beach: [
      "food-drinks",
      "organized",
      "social"
    ]
  },

  "urban": {
    beach: [
      "urban",
      "promenade"
    ]
  },

  "hidden": {
    beach: [
      "hidden-gem",
      "low-occupancy"
    ]
  },

  "nature": {
    beach: [
      "nature",
      "cliffs",
      "exploration"
    ]
  }

};




const selectedStyles = [];

const counter =
  document.getElementById(
    "selectionCounter"
  );

const continueBtn =
  document.getElementById(
    "continueBtn"
  );

document
  .querySelectorAll(".style-card")
  .forEach(card => {

    card.addEventListener("click", () => {

      const style =
        card.dataset.style;

      if (
        !selectedStyles.includes(style) &&
        selectedStyles.length >= 3
      ) {

        alert(
          "You can select up to 3 styles."
        );

        return;

      }

      card.classList.toggle(
        "selected"
      );

      if (
        selectedStyles.includes(style)
      ) {

        const index =
          selectedStyles.indexOf(style);

        selectedStyles.splice(
          index,
          1
        );

      } else {

        selectedStyles.push(style);

      }

      counter.textContent =
        `${selectedStyles.length} of 3 styles selected`;

      if (
        selectedStyles.length > 0
      ) {

        continueBtn.classList.remove(
          "disabled"
        );

      } else {

        continueBtn.classList.add(
          "disabled"
        );

      }

    });

});
continueBtn.addEventListener(
  "click",
  () => {

    document
      .querySelector(".style-grid")
      .style.display = "none";

    document
      .querySelector(".find-header")
      .style.display = "none";

    continueBtn.style.display =
      "none";

    document
      .getElementById(
        "stayPreferences"
      )
      .style.display = "block";

  }
);
console.log("JS LOADED");
document
  .querySelectorAll(".compact-options")
  .forEach(group => {

    const buttons =
      group.querySelectorAll(
        ".compact-option"
      );

    buttons.forEach(btn => {

      btn.addEventListener(
        "click",
        () => {

          buttons.forEach(b =>
            b.classList.remove(
              "selected"
            )
          );

          btn.classList.add(
            "selected"
          );

        }
      );

    });

});
const userPreferences = {
  styles: [],
  guests: 2,
  distance: 100,
  pool: "any",
  pet: "any"
};

document
  .querySelectorAll(".compact-options")
  .forEach(group => {

    const buttons =
      group.querySelectorAll(
        ".compact-option"
      );

    buttons.forEach(btn => {

      btn.addEventListener(
        "click",
        () => {

          buttons.forEach(b =>
            b.classList.remove(
              "selected"
            )
          );

          btn.classList.add(
            "selected"
          );

        }
      );

    });

});

document
  .getElementById(
    "findResultsBtn"
  )
  .addEventListener(
    "click",
    () => {
       

      userPreferences.guests =
        document.getElementById(
          "guestCount"
        ).value;

      userPreferences.distance =
        document.querySelector(
          "[data-distance].selected"
        )?.dataset.distance;

      userPreferences.pool =
        document.querySelector(
          "[data-pool].selected"
        )?.dataset.pool;

      userPreferences.pet =
        document.querySelector(
          "[data-pet].selected"
        )?.dataset.pet;

      userPreferences.styles =
  [...selectedStyles];

localStorage.setItem(
  "findMyHalkidiki",
  JSON.stringify(
    userPreferences
  )
);

console.log(
  userPreferences
);
window.location.href =
  "find-results.html";

    }
);

