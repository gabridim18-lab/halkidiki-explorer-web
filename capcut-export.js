(function () {
  "use strict";
  const core = window.HalkidikiCapCutCore;
  const $ = id => document.getElementById(id);
  let context = null;
  let scenes = [];
  let selectedIndex = 0;
  let active = false;
  let exportController = null;
  let playbackTimer = null;
  let playbackStarted = 0;
  let draggedIndex = null;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setStatus(message = "", error = false) {
    $("capcutStatus").textContent = message;
    $("capcutStatus").className = error ? "form-message error" : "form-message";
  }

  function selectionChanged() {
    document.dispatchEvent(new CustomEvent("capcut:selectionchange"));
  }

  function stopPlayback() {
    if (playbackTimer !== null) window.clearInterval(playbackTimer);
    playbackTimer = null;
    $("capcutPlayButton").textContent = "Play sequence";
  }

  function createScene(image, index, seedFacts = false) {
    const facts = core.factsFor(context);
    const used = new Set(scenes.flatMap(scene => scene.factIds));
    const priority = ["guests", "bedrooms", "beach-distance", "pool", "view", "family-friendly", "water-entry", "beach-type", "cuisine", "features"];
    const factIds = index && seedFacts ? priority.filter(id => facts.has(id) && !used.has(id)).slice(0, 2) : [];
    const identity = context.creativePack.identity || {};
    return { imageId: image.id, durationMs: 4000, extraText: index === 0 ? core.cleanText([identity.title, identity.location].filter(Boolean).join("\n")).slice(0, 180) : "", factIds };
  }

  function setListing(listing) {
    if (exportController) exportController.abort();
    stopPlayback();
    context = listing;
    scenes = [];
    selectedIndex = 0;
    $("capcutCaption").value = listing ? [listing.creativePack?.descriptions?.short, (listing.creativePack?.descriptions?.hashtags || []).join(" "), "https://www.halkidikiexplorer.com/"].filter(Boolean).join("\n\n") : "";
    if (listing?.creativePack) {
      for (const image of listing.images.slice(0, 3)) scenes.push(createScene(image, scenes.length, true));
    }
    setStatus();
    render();
    selectionChanged();
  }

  function setMode(value) {
    active = value;
    stopPlayback();
    $("capcutPanel").hidden = !active;
    $("creativePackPreview").hidden = active;
    document.querySelector(".optional-poster").hidden = active;
    document.querySelector(".preview-card").setAttribute("aria-labelledby", active ? "capcut-title" : "preview-title");
    document.querySelector(".angle-fieldset").hidden = active;
    $("briefModeButton").setAttribute("aria-pressed", String(!active));
    $("capcutModeButton").setAttribute("aria-pressed", String(active));
    document.body.classList.toggle("capcut-active", active);
    $("imagePickerHelp").textContent = active ? "Click photos to add or remove scenes. Use arrows or drag the scene cards to change their order. Up to 24 photos." : "Choose one hero image and up to three supporting images. Only canonical listing images can be selected.";
    document.dispatchEvent(new CustomEvent("capcut:modechange", { detail: { active } }));
  }

  function renderPhotos(container, status) {
    container.replaceChildren();
    if (!context?.images.length) {
      container.appendChild(element("p", "picker-empty", "Select a listing to load published photos."));
      status.textContent = "No scenes selected";
      return;
    }
    for (const image of context.images) {
      const index = scenes.findIndex(scene => scene.imageId === image.id);
      const button = element("button", `capcut-photo-choice${index >= 0 ? " is-selected" : ""}`);
      button.type = "button";
      button.disabled = Boolean(exportController);
      button.setAttribute("aria-pressed", String(index >= 0));
      button.setAttribute("aria-label", `${index >= 0 ? "Remove" : "Add"} photo ${context.images.indexOf(image) + 1}`);
      const photo = element("img");
      photo.src = image.url;
      photo.alt = image.alt || "Published listing photo";
      photo.loading = "lazy";
      button.append(photo, element("span", "capcut-photo-badge", index >= 0 ? `Scene ${index + 1} ✓` : "+ Add scene"));
      button.addEventListener("click", () => togglePhoto(image));
      container.appendChild(button);
    }
    status.textContent = `${scenes.length} / ${core.MAX_SCENES} scenes`;
  }

  function togglePhoto(image) {
    if (exportController) return;
    stopPlayback();
    const index = scenes.findIndex(scene => scene.imageId === image.id);
    if (index >= 0) {
      const selected = scenes[selectedIndex];
      scenes.splice(index, 1);
      const retainedIndex = scenes.indexOf(selected);
      selectedIndex = retainedIndex >= 0 ? retainedIndex : Math.min(index, Math.max(0, scenes.length - 1));
    } else {
      if (scenes.length >= core.MAX_SCENES) return setStatus(`Choose up to ${core.MAX_SCENES} photos.`, true);
      scenes.push(createScene(image, scenes.length));
      selectedIndex = scenes.length - 1;
    }
    setStatus();
    render();
    selectionChanged();
  }

  function moveScene(from, to) {
    if (exportController || to < 0 || to >= scenes.length || from === to) return;
    stopPlayback();
    const selected = scenes[selectedIndex];
    const [scene] = scenes.splice(from, 1);
    scenes.splice(to, 0, scene);
    selectedIndex = scenes.indexOf(selected);
    render();
    selectionChanged();
  }

  function renderSceneCards() {
    $("capcutScenes").replaceChildren();
    if (!scenes.length) $("capcutScenes").appendChild(element("p", "helper-text", "Choose a photo on the left to add your first scene."));
    const images = new Map((context?.images || []).map(image => [image.id, image]));
    scenes.forEach((scene, index) => {
      const card = element("article", `capcut-scene-card${index === selectedIndex ? " is-current" : ""}`);
      card.draggable = !exportController;
      card.addEventListener("dragstart", event => { draggedIndex = index; event.dataTransfer.setData("text/plain", String(index)); event.dataTransfer.effectAllowed = "move"; });
      card.addEventListener("dragover", event => { if (draggedIndex !== null) event.preventDefault(); });
      card.addEventListener("drop", event => { event.preventDefault(); if (draggedIndex !== null) moveScene(draggedIndex, index); draggedIndex = null; });
      card.addEventListener("dragend", () => { draggedIndex = null; });
      const select = element("button", "capcut-scene-select");
      select.type = "button";
      select.disabled = Boolean(exportController);
      select.setAttribute("aria-pressed", String(index === selectedIndex));
      select.setAttribute("aria-label", `Edit scene ${index + 1}`);
      const photo = element("img");
      photo.src = images.get(scene.imageId).url;
      photo.alt = "";
      photo.draggable = false;
      select.append(photo, element("strong", "", `${String(index + 1).padStart(2, "0")} · ${(scene.durationMs / 1000).toFixed(1)}s`));
      select.addEventListener("click", () => { stopPlayback(); selectedIndex = index; render(); });
      const controls = element("div", "capcut-scene-controls");
      for (const [label, delta] of [["←", -1], ["→", 1]]) {
        const button = element("button", "", label);
        button.type = "button";
        button.disabled = Boolean(exportController) || index + delta < 0 || index + delta >= scenes.length;
        button.setAttribute("aria-label", `Move scene ${index + 1} ${delta < 0 ? "earlier" : "later"}`);
        button.addEventListener("click", () => moveScene(index, index + delta));
        controls.appendChild(button);
      }
      card.append(select, controls);
      $("capcutScenes").appendChild(card);
    });
  }

  function renderFacts(scene) {
    $("capcutFacts").replaceChildren();
    $("capcutFacts").scrollTop = 0;
    for (const group of context?.creativePack?.factGroups || []) {
      const usable = (group.facts || []).filter(fact => core.cleanText(fact.value));
      if (!usable.length) continue;
      const fieldset = element("fieldset", "capcut-fact-group");
      fieldset.appendChild(element("legend", "", group.label || group.title || "Listing facts"));
      for (const fact of usable) {
        const label = element("label", "capcut-fact-option");
        const checkbox = element("input");
        checkbox.type = "checkbox";
        checkbox.checked = scene.factIds.includes(fact.id);
        checkbox.disabled = Boolean(exportController);
        checkbox.addEventListener("change", () => {
          stopPlayback();
          if (checkbox.checked && scene.factIds.length >= 3) { checkbox.checked = false; return setStatus("Choose up to 3 facts for this scene.", true); }
          scene.factIds = checkbox.checked ? [...scene.factIds, fact.id] : scene.factIds.filter(id => id !== fact.id);
          setStatus();
          renderPreview();
        });
        const text = element("span");
        text.append(element("strong", "", fact.label || "Fact"), element("small", "", fact.value));
        label.append(checkbox, text);
        fieldset.appendChild(label);
      }
      $("capcutFacts").appendChild(fieldset);
    }
    if (!$("capcutFacts").childElementCount) $("capcutFacts").appendChild(element("p", "helper-text", "No verified facts are available. You can add your own short line."));
  }

  function renderPreview(elapsedMs) {
    const scene = scenes[selectedIndex];
    $("capcutFrame").hidden = !scene;
    $("capcutPlayButton").disabled = !scene || Boolean(exportController);
    if (!scene) { $("capcutTime").textContent = ""; return; }
    const rows = core.timeline(context, scenes);
    const row = rows[selectedIndex];
    $("capcutPreviewImage").src = row.image.url;
    $("capcutPreviewText").textContent = row.text;
    $("capcutPreviewNumber").textContent = `${selectedIndex + 1} / ${scenes.length}`;
    $("capcutTime").textContent = `${((elapsedMs ?? row.startMs) / 1000).toFixed(1)} / ${(rows.at(-1).endMs / 1000).toFixed(1)} s`;
    $("capcutSummary").textContent = `${scenes.length} scenes · ${(rows.at(-1).endMs / 1000).toFixed(1)} s`;
  }

  function render() {
    const ready = Boolean(context?.creativePack);
    $("capcutEmpty").hidden = ready;
    $("capcutContent").hidden = !ready;
    const scene = scenes[selectedIndex];
    $("capcutInspector").hidden = !scene;
    $("capcutInspector").disabled = Boolean(exportController);
    $("capcutExportButton").disabled = !scene || Boolean(exportController);
    $("capcutSrtButton").disabled = !scene || Boolean(exportController);
    $("capcutCaption").disabled = Boolean(exportController);
    $("capcutIncludeLogo").disabled = Boolean(exportController);
    $("capcutCancelButton").hidden = !exportController;
    $("capcutSummary").textContent = `${scenes.length} scenes`;
    renderSceneCards();
    if (scene) {
      $("capcutSceneTitle").textContent = `Scene ${selectedIndex + 1}`;
      $("capcutDuration").value = (scene.durationMs / 1000).toFixed(1);
      $("capcutExtraText").value = scene.extraText;
      renderFacts(scene);
    }
    renderPreview();
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = element("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function fetchImage(url, parentSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    parentSignal.addEventListener("abort", abort, { once: true });
    if (parentSignal.aborted) controller.abort();
    const timeout = window.setTimeout(abort, 20000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Image download failed (${response.status}). Retry the export.`);
      if (Number(response.headers.get("content-length")) > 25 * 1024 * 1024) throw new Error("A photo is too large for this export (25 MB maximum per image).");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 25 * 1024 * 1024) throw new Error("A photo is too large for this export (25 MB maximum per image).");
      core.imageExtension(bytes);
      return bytes;
    } catch (error) {
      if (controller.signal.aborted && !parentSignal.aborted) throw new Error("Image download timed out. Retry the export.");
      throw error;
    } finally {
      window.clearTimeout(timeout);
      parentSignal.removeEventListener("abort", abort);
    }
  }

  async function exportZip() {
    if (exportController) return;
    stopPlayback();
    const exportContext = context;
    const exportScenes = scenes.map(scene => ({ ...scene, factIds: [...scene.factIds] }));
    const caption = $("capcutCaption").value;
    const includeLogo = $("capcutIncludeLogo").checked;
    const controller = new AbortController();
    exportController = controller;
    render();
    selectionChanged();
    try {
      if (!window.JSZip) throw new Error("ZIP export is unavailable. Reload the Studio.");
      const rows = core.timeline(exportContext, exportScenes);
      const assets = new Map();
      let totalBytes = 0;
      for (const row of rows) {
        setStatus(`Downloading photo ${row.number} of ${rows.length}…`);
        let bytes;
        try { bytes = await fetchImage(row.image.url, controller.signal); }
        catch (error) { if (controller.signal.aborted) throw error; throw new Error(`Photo ${row.number}: ${error.message}`); }
        totalBytes += bytes.length;
        if (totalBytes > 128 * 1024 * 1024) throw new Error("The selected photos exceed 128 MB. Choose fewer photos.");
        assets.set(row.image.id, bytes);
      }
      setStatus("Preparing texts and scene plan…");
      const logoBytes = includeLogo ? await fetchImage("images/logo.png", controller.signal) : null;
      const handoff = core.buildHandoff(exportContext, exportScenes, assets, caption, logoBytes);
      const zip = new window.JSZip();
      handoff.entries.forEach(entry => zip.file(entry.name, entry.data));
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" }, metadata => { if (!controller.signal.aborted) setStatus(`Preparing ZIP… ${Math.round(metadata.percent)}%`); });
      if (controller.signal.aborted || context !== exportContext) return;
      download(blob, handoff.filename);
      setStatus(`Ready: ${rows.length} photos, ${handoff.manifest.totalDurationMs / 1000}s. Extract the ZIP and follow START-CapCut.txt.`);
    } catch (error) {
      if (context === exportContext) setStatus(controller.signal.aborted ? "Export cancelled." : error.message || "Export failed. Retry the download.", !controller.signal.aborted);
    } finally {
      if (exportController === controller) exportController = null;
      render();
      selectionChanged();
    }
  }

  $("briefModeButton").addEventListener("click", () => setMode(false));
  $("capcutModeButton").addEventListener("click", () => setMode(true));
  $("capcutDuration").addEventListener("change", event => {
    stopPlayback();
    if (!scenes[selectedIndex]) return;
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value < 1 || value > 15) {
      event.target.value = scenes[selectedIndex].durationMs / 1000;
      return setStatus("Choose a duration between 1 and 15 seconds.", true);
    }
    scenes[selectedIndex].durationMs = Math.round(value * 1000);
    setStatus();
    render();
  });
  $("capcutExtraText").addEventListener("input", event => {
    stopPlayback();
    if (!scenes[selectedIndex]) return;
    scenes[selectedIndex].extraText = event.target.value;
    setStatus();
    renderPreview();
  });
  $("capcutPlayButton").addEventListener("click", () => {
    if (playbackTimer !== null) { stopPlayback(); render(); return; }
    if (!scenes.length) return;
    selectedIndex = 0;
    render();
    const rows = core.timeline(context, scenes);
    playbackStarted = performance.now();
    $("capcutPlayButton").textContent = "Pause";
    playbackTimer = window.setInterval(() => {
      const elapsed = Math.round(performance.now() - playbackStarted);
      if (elapsed >= rows.at(-1).endMs) { stopPlayback(); selectedIndex = scenes.length - 1; render(); return; }
      const index = rows.findIndex(row => elapsed < row.endMs);
      if (selectedIndex !== index) { selectedIndex = index; render(); }
      renderPreview(elapsed);
    }, 100);
  });
  $("capcutExportButton").addEventListener("click", exportZip);
  $("capcutCancelButton").addEventListener("click", () => exportController?.abort());
  $("capcutSrtButton").addEventListener("click", () => {
    try {
      const srt = core.buildSrt(context, scenes);
      if (!srt) return setStatus("Add text or choose facts for at least one scene.", true);
      download(new Blob([srt], { type: "text/plain;charset=utf-8" }), `${core.safeStem(context.listingId)}_${core.safeStem(context.language)}.srt`);
      setStatus("SRT downloaded. Use the same scene order and durations in CapCut.");
    } catch (error) { setStatus(error.message, true); }
  });

  window.HalkidikiCapCut = { isActive: () => active, setListing, renderPhotos };
  render();
})();
