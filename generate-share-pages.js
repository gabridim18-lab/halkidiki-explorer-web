const fs = require("fs");
const path = require("path");

const dataFile =
  fs.readFileSync(
    path.join(__dirname, "data.js"),
    "utf-8"
  );

const match =
  dataFile.match(
    /const accommodations = (\[[\s\S]*\]);/
  );

if (!match) {

  console.log("Could not find accommodations array.");

  process.exit(1);

}

const accommodations =
  eval(match[1]);

const sharePath =
  path.join(__dirname, "share");

if (!fs.existsSync(sharePath)) {

  fs.mkdirSync(sharePath);

}

accommodations.forEach(item => {

  const title =
    item.id
      .replaceAll("_", " ")
      .replace(/\b\w/g, l => l.toUpperCase());

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>

<meta charset="UTF-8">

<title>${title}</title>

<meta property="og:title"
content="${title}">

<meta property="og:description"
content="Discover this accommodation on Halkidiki Explorer">

<meta property="og:image"
content="https://halkidikiexplorer.com/images/${item.flyer}">

<meta property="og:type"
content="website">

<meta property="og:url"
content="https://halkidikiexplorer.com/share/${item.id}.html">

<meta name="twitter:card"
content="summary_large_image">

<script>
setTimeout(() => {

window.location.href =
"https://halkidikiexplorer.com/accommodation.html?id=${item.id}";

}, 300);

</script>

</head>

<body style="font-family:Arial;padding:40px;">

Opening accommodation...

</body>
</html>
`;

  fs.writeFileSync(

    path.join(
      sharePath,
      `${item.id}.html`
    ),

    html

  );

  console.log(
    "Generated:",
    `${item.id}.html`
  );

});

console.log("DONE!");