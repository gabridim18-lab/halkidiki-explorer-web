"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../capcut-export-core.js");
const JSZip = require("../vendor/jszip-3.10.1.min.js");
const png = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1cAAAAASUVORK5CYII=", "base64"));
const context = {
  listingId: "test_stay", category: "accommodation", language: "ro",
  images: ["a", "b", "c"].map(id => ({ id, url: `https://example.test/${id}.png` })),
  creativePack: { identity: { title: "Vacanță în Halkidiki" }, factGroups: [{ facts: [{ id: "guests", label: "Capacitate", value: "5 oaspeți" }, { id: "bedrooms", label: "Dormitoare", value: "2" }] }] }
};
const sequence = () => [
  { imageId: "b", durationMs: 1500, extraText: "Vacanță în Halkidiki", factIds: [] },
  { imageId: "a", durationMs: 2750, extraText: "", factIds: [] },
  { imageId: "c", durationMs: 4000, extraText: "Planifică-ți sejurul!", factIds: ["guests", "bedrooms"] }
];
const assets = () => new Map(context.images.map(image => [image.id, png]));

test("SRT retains Unicode and the full elapsed time across a scene without text", () => {
  assert.equal(core.buildSrt(context, sequence()), "1\n00:00:00,000 --> 00:00:01,500\nVacanță în Halkidiki\n\n2\n00:00:04,250 --> 00:00:08,250\nPlanifică-ți sejurul!\nCapacitate: 5 oaspeți\nDormitoare: 2\n");
});

test("A reordered pack preserves photo bytes, selected facts, timing and original logo", async () => {
  const pack = core.buildHandoff(context, sequence(), assets(), "Descriere în română\n\n#HalkidikiExplorer", png);
  const zip = new JSZip();
  for (const entry of pack.entries) zip.file(entry.name, entry.data);
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
  const reopened = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const manifest = JSON.parse(await reopened.file("scene-plan.json").async("string"));
  assert.deepEqual(manifest.scenes.map(row => row.sourceUrl), ["https://example.test/b.png", "https://example.test/a.png", "https://example.test/c.png"]);
  assert.deepEqual(manifest.scenes.map(row => [row.startMs, row.endMs]), [[0,1500], [1500,4250], [4250,8250]]);
  assert.deepEqual(manifest.scenes[2].canonicalFactIds, ["guests", "bedrooms"]);
  for (const row of manifest.scenes) assert.deepEqual(await reopened.file(row.file).async("uint8array"), png);
  assert.deepEqual(await reopened.file("logo.png").async("uint8array"), png);
  assert.match(await reopened.file("descriere.txt").async("string"), /în română/);
  assert.match(await reopened.file("descriere.txt").async("string"), /română\n\n#HalkidikiExplorer/);
  assert.equal(await reopened.file("texte.srt").async("string"), core.buildSrt(context, sequence()));
  assert.match(await reopened.file("START-CapCut.txt").async("string"), /01_test_stay.png: 1.5 s/);
  if (process.env.CAPCUT_QA_DIR) fs.writeFileSync(path.join(process.env.CAPCUT_QA_DIR, "core-handoff.zip"), bytes);
});

test("Invalid, stale, duplicate or incomplete selections fail rather than exporting a misleading pack", () => {
  const invalid = sequence();
  invalid[0].durationMs = 999;
  assert.throws(() => core.buildSrt(context, invalid), /between 1 and 15/);
  invalid[0].durationMs = 15001;
  assert.throws(() => core.buildSrt(context, invalid), /between 1 and 15/);
  const duplicate = sequence(); duplicate[1].imageId = "b";
  assert.throws(() => core.buildSrt(context, duplicate), /repeated photo/);
  const unknownPhoto = sequence(); unknownPhoto[0].imageId = "old-listing-photo";
  assert.throws(() => core.buildSrt(context, unknownPhoto), /invalid/);
  const unknownFact = sequence(); unknownFact[0].factIds = ["pool"];
  assert.throws(() => core.buildSrt(context, unknownFact), /no longer available/);
  const missing = assets(); missing.delete("a");
  assert.throws(() => core.buildHandoff(context, sequence(), missing, ""), /Photo 2/);
  const html = assets(); html.set("a", new TextEncoder().encode("<html>Error</html>"));
  assert.throws(() => core.buildHandoff(context, sequence(), html, ""), /did not return/);
  assert.throws(() => core.buildSrt(null, sequence()), /Select a listing/);
});

test("Text-free exports deliberately omit an empty subtitle file", () => {
  const pack = core.buildHandoff(context, [{ imageId: "a", durationMs: 4000, extraText: "", factIds: [] }], assets(), "");
  assert.equal(pack.entries.some(entry => entry.name === "texte.srt"), false);
  assert.equal(pack.manifest.totalDurationMs, 4000);
});

test("Blank custom lines and control characters cannot create extra SRT blocks", () => {
  const scenes = sequence(); scenes[0].extraText = "Prima linie\r\n\r\nA doua linie\u0000";
  assert.match(core.buildSrt(context, scenes), /^1\n00:00:00,000 --> 00:00:01,500\nPrima linie\nA doua linie\n\n2\n/);
});
