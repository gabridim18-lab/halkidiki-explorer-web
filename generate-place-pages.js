const fs = require("fs")
const path = require("path")

const SITE_URL = "https://www.halkidikiexplorer.com"
const DATA_BASE = "https://raw.githubusercontent.com/gabridim18-lab/halkidiki-data/main/data/restaurants"

function cleanText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .replace(/"/g, "&quot;")
    .trim()
}

function shortDescription(place) {
  const text =
    place.descriptionEn ||
    place.descriptionRo ||
    "Discover photos, menu, opening hours, directions and details on Halkidiki Explorer."

  return cleanText(text).slice(0, 180)
}

function pageHtml(place) {
  const id = place.id
  const title = cleanText(place.titleEn || place.titleRo || id)
  const description = shortDescription(place)
  const image = place.images?.[0] || `${SITE_URL}/images/share-default.webp`
  const url = `${SITE_URL}/place/${id}/`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <link rel="icon" type="image/png" href="/favicon-32x32.png">

  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${title} | Halkidiki Explorer</title>
  <meta name="description" content="${description}">

  <meta property="og:title" content="${title} | Halkidiki Explorer">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${image}">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Halkidiki Explorer">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title} | Halkidiki Explorer">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">

  <link rel="canonical" href="${url}">
  <link rel="stylesheet" href="/place.css" />
</head>
<body>

<div id="place-page"></div>

<script src="/place.js"></script>

<footer class="site-footer">
  <div class="footer-left">
    © 2026 Halkidiki Explorer. All rights reserved.
  </div>

  <div class="footer-right">
    <a href="/privacy.html">Privacy Policy</a>
    <a href="/terms.html">Terms of Use</a>
    <a href="#">Facebook</a>
  </div>
</footer>

</body>
</html>`
}

async function main() {
  const indexResponse = await fetch(`${DATA_BASE}/restaurants-index.json`)
  const indexData = await indexResponse.json()

  for (const item of indexData) {
    try {
      const response = await fetch(`${DATA_BASE}/${item.id}/index.json`)
      const place = await response.json()

      const dir = path.join(__dirname, "place", place.id)
      fs.mkdirSync(dir, { recursive: true })

      fs.writeFileSync(
        path.join(dir, "index.html"),
        pageHtml(place),
        "utf8"
      )

      console.log(`Generated: /place/${place.id}/`)
    } catch (error) {
      console.error(`Failed: ${item.id}`, error.message)
    }
  }
}

main()