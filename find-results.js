const BEACHES_INDEX =
  "https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/refs/heads/main/data/beaches/beaches-index.json";

const ACCOMMODATIONS_INDEX =
  "https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/refs/heads/main/data/accommodations/index.json";

async function loadData() {

  try {

    const beachesResponse =
      await fetch(BEACHES_INDEX);

    const beaches =
      await beachesResponse.json();

    console.log(
      "Loaded beaches:",
      beaches.length
    );

    const accommodationsResponse =
      await fetch(
        ACCOMMODATIONS_INDEX
      );

    const accommodations =
      await accommodationsResponse.json();

    console.log(
      "Loaded accommodations:",
      accommodations.items.length
    );

    const preferences =
      JSON.parse(
        localStorage.getItem(
          "findMyHalkidiki"
        )
      );

    console.log(
      "Preferences:",
      preferences
    );

    const scoredBeaches =
      beaches.map(
        beach => {

          let score = 0;

          score +=
            beach.rating * 10;

          score +=
            beach.waterTemperature;

          if (
            beach.suitableForChildren
          ) {
            score += 20;
          }

          return {
            ...beach,
            score
          };

        }
      );

    scoredBeaches.sort(
      (a, b) =>
        b.score - a.score
    );

    const topBeaches =
      scoredBeaches.slice(
        0,
        3
      );

    console.log(
      "TOP BEACHES:",
      topBeaches
    );

    const winningBeach =
      topBeaches[0];

    console.log(
      "Winning beach:",
      winningBeach
    );
    console.log(
  "Winning beach keys:",
  Object.keys(
    winningBeach
  )
);

  }

  catch(error) {

    console.error(
      "Loading error:",
      error
    );

  }

}

loadData();