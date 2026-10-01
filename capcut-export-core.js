(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HalkidikiCapCutCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MAX_SCENES = 24;

  function cleanText(value) {
    return String(value ?? "").replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .split("\n").map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  }

  function safeStem(value) {
    return String(value || "listing").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "listing";
  }

  function factsFor(context) {
    const facts = new Map();
    for (const group of context?.creativePack?.factGroups || []) {
      for (const fact of group.facts || []) {
        if (typeof fact.id === "string" && cleanText(fact.value) && !facts.has(fact.id)) facts.set(fact.id, fact);
      }
    }
    return facts;
  }

  function factText(fact) {
    const label = cleanText(fact.label);
    const value = cleanText(fact.value);
    return label ? `${label}: ${value}` : value;
  }

  function sceneText(scene, facts) {
    const lines = [cleanText(scene.extraText)];
    for (const id of scene.factIds || []) {
      const fact = facts.get(id);
      if (!fact) throw new Error("A selected fact is no longer available. Reload the listing.");
      lines.push(factText(fact));
    }
    return lines.filter(Boolean).join("\n");
  }

  function timecode(milliseconds) {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new Error("Invalid caption time.");
    const hours = Math.floor(milliseconds / 3600000);
    const minutes = Math.floor(milliseconds / 60000) % 60;
    const seconds = Math.floor(milliseconds / 1000) % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds % 1000).padStart(3, "0")}`;
  }

  function timeline(context, scenes) {
    if (!context?.listingId || !context?.creativePack) throw new Error("Select a listing before exporting.");
    if (!scenes.length) throw new Error("Choose at least one photo.");
    if (scenes.length > MAX_SCENES) throw new Error(`Choose up to ${MAX_SCENES} photos.`);
    const images = new Map((context.images || []).map(image => [image.id, image]));
    const facts = factsFor(context);
    const seen = new Set();
    let cursor = 0;
    return scenes.map((scene, index) => {
      if (!images.has(scene.imageId) || seen.has(scene.imageId)) throw new Error("A scene has an invalid or repeated photo.");
      if (!Number.isInteger(scene.durationMs) || scene.durationMs < 1000 || scene.durationMs > 15000) throw new Error("Each scene must last between 1 and 15 seconds.");
      if (new Set(scene.factIds || []).size !== (scene.factIds || []).length || (scene.factIds || []).length > 3) throw new Error("Choose up to three different facts per scene.");
      if (cleanText(scene.extraText).length > 180) throw new Error("Keep each extra line within 180 characters.");
      seen.add(scene.imageId);
      const item = { number: index + 1, image: images.get(scene.imageId), startMs: cursor, endMs: cursor + scene.durationMs, durationMs: scene.durationMs, text: sceneText(scene, facts), factIds: [...(scene.factIds || [])], extraText: cleanText(scene.extraText) };
      cursor = item.endMs;
      return item;
    });
  }

  function buildSrt(context, scenes) {
    const rows = timeline(context, scenes);
    let cue = 0;
    return rows.filter(row => row.text).map(row => `${++cue}\n${timecode(row.startMs)} --> ${timecode(row.endMs)}\n${row.text}\n`).join("\n");
  }

  function imageExtension(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
    if ([137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return "png";
    if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
    throw new Error("A photo did not return a JPG, PNG or WebP image. Retry the export.");
  }

  function instructions(rows, language) {
    const ro = language === "ro";
    const hasText = rows.some(row => row.text);
    const intro = ro ? [
      "PACHET PENTRU CAPCUT DESKTOP", "",
      "1. Extrage complet ZIP-ul intr-un folder pe calculator.",
      "2. Deschide CapCut Desktop si creeaza un proiect 9:16.",
      "3. Importa fotografiile din images. Sorteaza dupa nume (A-Z).",
      "4. Pune-le consecutiv pe timeline, in ordinea numerelor, de la secunda 0.",
      "5. Seteaza durata fiecarei fotografii conform planului de mai jos.",
      hasText ? "6. In sectiunea Captions / subtitrari, importa texte.srt." : "6. Nu ai selectat texte pentru scene; nu este necesar importul SRT.",
      "7. Alege fontul, marimea, pozitia si animatia textelor in CapCut.",
      "8. Adauga muzica si logo.png daca este inclus. Foloseste descriere.txt pentru postare.", "",
      "SRT-ul contine textele si timpii. Incadrarea, fonturile si efectele se aleg in CapCut.",
      "Daca schimbi duratele sau suprapui scenele prin tranzitii, ajusteaza si timpii textelor.",
      "scene-plan.json este un plan de montaj, nu un proiect nativ CapCut.", "", "ORDINE SI DURATE"
    ] : [
      "CAPCUT DESKTOP HANDOFF", "",
      "1. Extract the entire ZIP into a folder on your computer.",
      "2. Open CapCut Desktop and create a 9:16 project.",
      "3. Import the photos in images. Sort by filename (A-Z).",
      "4. Place them consecutively on the timeline, in numbered order, starting at 0.",
      "5. Set each photo's duration according to the scene plan below.",
      hasText ? "6. Import texte.srt from the Captions / subtitle import section." : "6. No scene text was selected; no subtitle import is needed.",
      "7. Choose the text font, size, position and animation in CapCut.",
      "8. Add music and logo.png if included. Use descriere.txt for the post.", "",
      "SRT contains text and timing. Framing, fonts and effects are chosen in CapCut.",
      "If you change durations or overlap scenes with transitions, adjust the text timings too.",
      "scene-plan.json is a scene plan, not a native CapCut project.", "", "ORDER AND DURATION"
    ];
    return [...intro, ...rows.map(row => `${row.file}: ${(row.durationMs / 1000).toFixed(1)} s | ${timecode(row.startMs)} - ${timecode(row.endMs)}\n${row.text || "(no text)"}`), "", "Subtitle import help: https://www.capcut.com/help/how-to-import-subtitles", ""].join("\n");
  }

  function buildHandoff(context, scenes, assets, caption, logoBytes) {
    const rows = timeline(context, scenes);
    const stem = safeStem(context.listingId);
    const entries = [];
    for (const row of rows) {
      const bytes = assets.get(row.image.id);
      if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error(`Photo ${row.number} could not be downloaded. No incomplete ZIP was created.`);
      const extension = imageExtension(bytes);
      row.file = `images/${String(row.number).padStart(2, "0")}_${stem}.${extension}`;
      entries.push({ name: row.file, data: bytes });
    }
    const srt = buildSrt(context, scenes);
    // A valid empty-text sequence deliberately omits the subtitle file.
    if (srt) entries.push({ name: "texte.srt", data: srt });
    const manifest = {
      format: "halkidiki-capcut-handoff", version: 1, listingId: context.listingId,
      category: context.category, language: context.language,
      title: context.creativePack.identity?.title || context.listingId,
      totalDurationMs: rows.at(-1).endMs,
      scenes: rows.map(row => ({ number: row.number, file: row.file, sourceUrl: row.image.url, durationMs: row.durationMs, startMs: row.startMs, endMs: row.endMs, text: row.text, canonicalFactIds: row.factIds, additionalText: row.extraText }))
    };
    entries.push({ name: "scene-plan.json", data: JSON.stringify(manifest, null, 2) + "\n" });
    entries.push({ name: "descriere.txt", data: String(caption ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim() + "\n" });
    entries.push({ name: "START-CapCut.txt", data: instructions(rows, context.language) + (srt ? "" : "\nNo scene text was selected; the subtitle file is omitted.\n") });
    if (logoBytes) {
      if (imageExtension(logoBytes) !== "png") throw new Error("The original PNG logo could not be loaded.");
      entries.push({ name: "logo.png", data: logoBytes });
    }
    return { filename: `${stem}_${safeStem(context.language)}_capcut.zip`, entries, manifest };
  }

  return { MAX_SCENES, cleanText, safeStem, factsFor, factText, sceneText, timecode, timeline, buildSrt, imageExtension, buildHandoff };
});
