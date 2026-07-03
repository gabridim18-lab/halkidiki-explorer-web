const fs = require("fs")
const path = require("path")

const SITE_URL = "https://www.halkidikiexplorer.com"
const DATA_BASE = "https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data/local-businesses"

function cleanText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim()
}

function plainText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim()
}

function getCategoryIcon(category = "") {
  const value = category.toLowerCase()

  if (value.includes("car") || value.includes("rent")) return "🚗"
  if (value.includes("transfer") || value.includes("taxi") || value.includes("airport")) return "🚐"
  if (value.includes("water") || value.includes("sport") || value.includes("boat")) return "🌊"
  if (value.includes("tour") || value.includes("trip") || value.includes("experience")) return "🧭"
  if (value.includes("bike") || value.includes("scooter")) return "🛵"
  if (value.includes("market") || value.includes("shop")) return "🛍️"
  if (value.includes("pharmacy") || value.includes("medical")) return "💊"

  return "🧳"
}

function shortDescription(business) {
  const category = business.categoryEn || business.categoryRo || "Travel Essential"

  const description =
    business.descriptionEn ||
    business.descriptionRo ||
    `${category} • Halkidiki Explorer`

  return cleanText(
    plainText(description).slice(0, 180)
  )
}

function getShareImage(business) {
  const firstImage =
    business.heroImage ||
    business.images?.[0] ||
    ""

  if (!firstImage) {
    return `${SITE_URL}/images/share-default.webp`
  }

  if (
    firstImage.startsWith("http://") ||
    firstImage.startsWith("https://")
  ) {
    return firstImage
  }

  return `${DATA_BASE}/${business.id}/images/${firstImage}`
}
function pageHtml(business) {
  const id = business.id

  const title = cleanText(
    business.titleEn ||
    business.titleRo ||
    id.replaceAll("-", " ").replaceAll("_", " ")
  )

  const category = cleanText(
    business.categoryEn ||
    business.categoryRo ||
    "Travel Essential"
  )

  const icon = getCategoryIcon(category)
  const description = shortDescription(business)
  const image = cleanText(getShareImage(business))

  const url =
    `${SITE_URL}/local-business/${id}/`

  const redirectUrl =
    `${SITE_URL}/local-business.html?id=${id}`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <link rel="icon" type="image/png" href="/favicon-32x32.png">

  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${title} | Halkidiki Explorer</title>
  <meta name="description" content="${description}">

  <meta property="og:title" content="${title} | Halkidiki Explorer">
  <meta property="og:description" content="${icon} ${category} • Halkidiki Explorer">
  <meta property="og:image" content="${image}">
  <meta property="og:image:secure_url" content="${image}">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Halkidiki Explorer">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title} | Halkidiki Explorer">
  <meta name="twitter:description" content="${icon} ${category} • Halkidiki Explorer">
  <meta name="twitter:image" content="${image}">

  <link rel="canonical" href="${url}">

  <meta http-equiv="refresh" content="0; url=${redirectUrl}">

  <script>
    window.location.replace("${redirectUrl}")
  </script>
</head>
<body>
  <p>
    Opening ${title} on Halkidiki Explorer...
    <a href="${redirectUrl}">Click here if you are not redirected.</a>
  </p>
</body>
</html>`
}
async function main() {
  const indexResponse =
    await fetch(`${DATA_BASE}/local-businesses-index.json`)

  const indexData =
    await indexResponse.json()

  for (const item of indexData) {
    try {
      const response =
        await fetch(`${DATA_BASE}/${item.id}/index.json`)

      const business =
        await response.json()

      if (!business.id) {
        business.id = item.id
      }

      const dir =
        path.join(
          __dirname,
          "local-business",
          business.id
        )

      fs.mkdirSync(dir, {
        recursive: true
      })

      fs.writeFileSync(
        path.join(dir, "index.html"),
        pageHtml(business),
        "utf8"
      )

      console.log(
        `Generated: /local-business/${business.id}/`
      )

    } catch (error) {
      console.error(
        `Failed: ${item.id}`,
        error.message
      )
    }
  }
}

main()