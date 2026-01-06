// Vanilla JS Warscroll generator (no React, no html2canvas).
// - Loads local translations from app/js/localization/{de,en}.json
// - Renders UI in #root
// - Draws PNG directly with canvas (no external libs required)
//
// Updated: inputs validated and formatted:
// - MOVE: accepts numbers >= 0, step 0.5; displayed as inches with a trailing double-quote (e.g. 6 or 6.5 -> 6")
// - SAVE: accepts integers >= 0, displayed with a trailing plus sign (e.g. 4 -> 4+)
// - HEALTH and CONTROL: integers >= 0
// - Empty input is allowed (treated as "none")
//
// The SVG preview and the exported PNG use the same formatting.

(function () {
  const ROOT = document.getElementById("root");
  if (!ROOT) return console.error("No #root element found");

  const TRANSLATION_PATH = "/app/js/localization"; // relative to site root; adjust if needed
  const BACKGROUND_IMAGE = "/data/img/warscroll.jpg"; // shared warscroll background
  const LANG_KEY = "language";

  const DEFAULT_EXPORT_SIZE = { width: 800, height: 1100 };

  // helper: load both translation files
  async function loadTranslations() {
    const langs = ["de", "en"];
    const res = {};
    await Promise.all(
      langs.map(async (l) => {
        try {
          const r = await fetch(`${TRANSLATION_PATH}/${l}.json`, { cache: "no-cache" });
          if (!r.ok) throw new Error(`status ${r.status}`);
          res[l] = await r.json();
        } catch (e) {
          console.warn("Could not load", l, e);
          res[l] = {};
        }
      })
    );
    return res;
  }

  // load an image and return a promise that resolves with the HTMLImageElement
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image: " + url));
      img.src = url;
    });
  }

  function getInitialLang() {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored) return stored;
    const nav = navigator.language || navigator.userLanguage || "en";
    return nav.startsWith("de") ? "de" : "en";
  }

  function setDocumentLang(lang) {
    try {
      document.documentElement.lang = lang === "de" ? "de" : "en";
    } catch (_) {}
  }

  // UI creation helper
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === "className") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function")
        e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      if (typeof c === "string") e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  }

  // Format a stat for display: move -> 6" , save -> 4+ , others -> plain number
  function formatStatForDisplay(key, rawValue) {
    if (rawValue == null || rawValue === "") return "";
    // rawValue may be string or number
    if (key === "move") {
      const n = Number(rawValue);
      if (Number.isNaN(n) || n < 0) return "";
      // Trim trailing .0
      const s = n % 1 === 0 ? String(n) : String(n).replace(/\.0+$/, "");
      return s + '"';
    }
    if (key === "save") {
      const n = parseInt(rawValue, 10);
      if (Number.isNaN(n) || n < 0) return "";
      return String(n) + "+";
    }
    // health, control
    const n = parseInt(rawValue, 10);
    if (Number.isNaN(n) || n < 0) return "";
    return String(n);
  }

  // draw a simple warscroll to a canvas and return it
  // width/height are in CSS pixels. The actual canvas uses devicePixelRatio for sharpness.
  // stats: { move, health, save, control } optional - drawn in the quarters.
  function drawWarscrollCanvas(title, width, height, bgImg = null, stats = {}) {
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    // Draw background image if available, otherwise plain white
    if (bgImg) {
      try {
        ctx.drawImage(bgImg, 0, 0, width, height);
      } catch (e) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }

    // decorative border
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, width - 24, height - 24);

    // title
    ctx.fillStyle = "#111";
    const titleFontSize = Math.max(18, Math.round(width * 0.035)); // scale font a bit with width
    ctx.font = `${titleFontSize}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const titleY = 36;
    wrapText(ctx, title, width / 2, titleY, width - 80, titleFontSize + 6);

    // draw the quarter numbers on the same positions as the SVG overlay uses
    // compute circle geometry using same heuristics
    const cx = Math.round(width * 0.157);   // same as preview heuristic
    const cy = Math.round(height * 0.105);
    const circleRadius = Math.round(Math.min(width, height) * 0.12);
    const numberRadius = Math.max(8, circleRadius * 0.45); // radial distance from center to number

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const numberFontSize = Math.max(12, Math.round(circleRadius * 0.4));
    ctx.font = `${numberFontSize}px sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 2;

    // helper to draw a stat number at angle (deg) with formatting
    function drawStatAtAngle(angleDeg, key) {
      const raw = stats[key];
      const formatted = formatStatForDisplay(key, raw);
      if (!formatted) return;
      const rad = (angleDeg * Math.PI) / 180;
      const nx = cx + numberRadius * Math.cos(rad);
      const ny = cy + numberRadius * Math.sin(rad);
      ctx.fillText(formatted, nx, ny);
    }

    // angles: top = 270, left = 180, right = 0, bottom = 90 (consistent with SVG)
    drawStatAtAngle(270, "move");
    drawStatAtAngle(180, "health");
    drawStatAtAngle(0,   "save");
    drawStatAtAngle(90,  "control");

    // placeholder content (stats/abilities)
    const bodyFontSize = Math.max(12, Math.round(width * 0.02));
    ctx.font = `${bodyFontSize}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillStyle = "#333";
    const contentStart = Math.round(titleY + titleFontSize + 16);
    const lineHeight = Math.round(bodyFontSize * 1.5);
    const sample = [
      "Unit Type: Custom",
      "Move: " + (formatStatForDisplay("move", stats.move) || "-"),
      "Wounds: " + (formatStatForDisplay("health", stats.health) || "-"),
      "Save: " + (formatStatForDisplay("save", stats.save) || "-"),
      "Control: " + (formatStatForDisplay("control", stats.control) || "-"),
      "",
      "Abilities:",
      "- Example ability 1",
      "- Example ability 2",
    ];
    sample.forEach((line, idx) => {
      ctx.fillText(line, 48, contentStart + idx * lineHeight);
    });

    // remove shadow for other drawing
    ctx.shadowBlur = 0;

    return canvas;
  }

  // simple word wrap helper for canvas text
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = (text || "").split(" ");
    let line = "";
    for (let n = 0; n < words.length; n++) {
      const testLine = line + (line ? " " : "") + words[n];
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n];
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }

  // convert polar angle (deg) to cartesian point (SVG coords: 0deg to the right, positive clockwise)
  function polarToCartesian(cx, cy, radius, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    const x = cx + radius * Math.cos(rad);
    const y = cy + radius * Math.sin(rad);
    return { x, y };
  }

  // create an SVG arc path string for an arc from startAngle to endAngle (degrees)
  // This implementation computes delta properly and sets the large-arc and sweep flags.
  function arcPathD(cx, cy, radius, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, radius, startAngle);
    const end = polarToCartesian(cx, cy, radius, endAngle);
    // compute delta in [0,360)
    let delta = ((endAngle - startAngle) % 360 + 360) % 360;
    const largeArcFlag = delta > 180 ? 1 : 0;
    // Sweep flag: 1 draws arc in positive-angle direction (clockwise) when delta>0 && delta<=180
    const sweepFlag = delta > 0 && delta <= 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  // render quarter labels as SVG overlay inside previewInner
  // quarters: { top, left, right, bottom } labels
  // stats: { move, health, save, control } numbers to display centered in quarters
  function renderQuarterLabels(previewInner, previewBox, imgWidth, imgHeight, quarters, stats = {}) {
    // Remove existing overlay if any
    const existing = previewInner.querySelector(".quarter-labels-overlay");
    if (existing) existing.remove();

    // Create SVG overlay sized to preview box
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "quarter-labels-overlay");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.setAttribute("viewBox", `0 0 ${imgWidth} ${imgHeight}`);
    svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none"; // let mouse events pass through
    svg.style.overflow = "visible";

    // Estimate circle center and radius relative to image size.
    const cx = Math.round(imgWidth * 0.157);   // ~15.7% from left
    const cy = Math.round(imgHeight * 0.105);  // ~10.5% from top
    const circleRadius = Math.round(Math.min(imgWidth, imgHeight) * 0.12); // ~12% of smaller dimension

    // text radius: place curved labels near rim
    const textRadius = Math.max(12, circleRadius * 0.70);

    // number radius: where the numeric stat is placed (closer to center than label)
    const numberRadius = Math.max(8, circleRadius * 0.40);

    // create defs and 4 path elements, one per quarter
    const defs = document.createElementNS(svg.namespaceURI, "defs");

    // Quarter definitions: right=0, bottom=90, left=180, top=270
    // reverse for bottom/left so text reads upright
    const quartersSpecs = [
      { id: "q-right",  centerAngle: 0,   label: quarters.right  || "", reverse: false },
      { id: "q-bottom", centerAngle: 90,  label: quarters.bottom || "", reverse: true  },
      { id: "q-left",   centerAngle: 180, label: quarters.left   || "", reverse: false  },
      { id: "q-top",    centerAngle: 270, label: quarters.top    || "", reverse: false },
    ];

    quartersSpecs.forEach((spec) => {
      const startAngle = spec.centerAngle - 45;
      const endAngle = spec.centerAngle + 45;
      const pathD = spec.reverse
        ? arcPathD(cx, cy, textRadius, endAngle, startAngle)
        : arcPathD(cx, cy, textRadius, startAngle, endAngle);

      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("id", spec.id);
      path.setAttribute("d", pathD);
      defs.appendChild(path);
    });

    svg.appendChild(defs);

    // Add curved text labels using textPath (white)
    quartersSpecs.forEach((spec) => {
      const text = document.createElementNS(svg.namespaceURI, "text");
      text.setAttribute("fill", "#ffffff");
      text.setAttribute("font-weight", "700");
      const fontSize = Math.max(10, Math.round(circleRadius * 0.15));
      text.setAttribute("font-size", fontSize);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      const textPath = document.createElementNS(svg.namespaceURI, "textPath");
      textPath.setAttribute("href", `#${spec.id}`);
      textPath.setAttribute("startOffset", "50%");
      textPath.textContent = (spec.label || "").toString();

      // Nudge the bottom label slightly inward so it sits inside the rim (kept small)
      if (spec.id === "q-bottom") {
        const angleRad = (spec.centerAngle * Math.PI) / 180;
        const offset = circleRadius * 0.99; // small inward offset
        const tx = (-Math.cos(angleRad) * offset).toFixed(2);
        const ty = (-Math.sin(angleRad) * offset).toFixed(2);
        text.setAttribute("transform", `translate(${tx} ${ty})`);
      }

      text.appendChild(textPath);
      svg.appendChild(text);
    });

    // Add stat numbers as upright centered text elements (not on path) so they sit neatly in quarters
    // angles: top=270, left=180, right=0, bottom=90
    const statsMap = [
      { angle: 270, key: "move" },
      { angle: 180, key: "health" },
      { angle: 0,   key: "save" },
      { angle: 90,  key: "control" },
    ];

    statsMap.forEach((s) => {
      const raw = stats[s.key];
      const formatted = formatStatForDisplay(s.key, raw);
      if (!formatted) return;
      const p = polarToCartesian(cx, cy, numberRadius, s.angle);
      const numEl = document.createElementNS(svg.namespaceURI, "text");
      numEl.setAttribute("x", p.x.toFixed(2));
      numEl.setAttribute("y", p.y.toFixed(2));
      numEl.setAttribute("fill", "#ffffff");
      numEl.setAttribute("font-weight", "700");
      const numFontSize = Math.max(12, Math.round(circleRadius * 0.3));
      numEl.setAttribute("font-size", numFontSize);
      numEl.setAttribute("text-anchor", "middle");
      numEl.setAttribute("dominant-baseline", "middle");
      numEl.textContent = formatted;
      svg.appendChild(numEl);
    });

    // append overlay to previewInner
    previewInner.appendChild(svg);
  }

  // build the app UI (language buttons, faction select, preview, save)
  async function bootstrap() {
    const translations = await loadTranslations();
    let lang = getInitialLang();
    setDocumentLang(lang);

    // start loading background image (don't await immediately)
    let bgImage = null;
    let bgLoadPromise = loadImage(BACKGROUND_IMAGE)
      .then((img) => {
        bgImage = img;
        return img;
      })
      .catch((err) => {
        console.warn("Background image not available:", err);
        bgImage = null;
        return null;
      });

    // Keep current stats in a small object so we can pass them to render/export
    const stats = { move: "", health: "", save: "", control: "" };

    // container layout
    const container = el("div", { className: "controls", style: "max-width:900px;margin:20px auto;box-sizing:border-box;padding:10 12px;" });

    // language switch
    const langSwitch = el("div", { className: "language-switch", role: "navigation", "aria-label": "Language switch" });
    ["de", "en"].forEach((l) => {
      const btn = el(
        "button",
        {
          className: `language-button ${lang === l ? "active" : ""}`,
          title: l === "de" ? "Deutsch" : "English",
          type: "button",
          onclick: () => {
            lang = l;
            localStorage.setItem(LANG_KEY, l);
            setDocumentLang(l);
            // update active states and UI text
            [...langSwitch.children].forEach((c) => c.classList.remove("active"));
            btn.classList.add("active");
            rootLabel.textContent = translations[lang]?.chooseFaction || (lang === "de" ? "Fraktion wählen" : "Choose faction");
            saveBtn.textContent = translations[lang]?.saveAsPng || (lang === "de" ? "Speichern" : "Save");
            buildFactionOptions();
            updatePreview();
            // re-render quarter labels with new language strings & stats
            if (previewImgSize) {
              const quarters = translations[lang]?.quarters || {};
              renderQuarterLabels(previewInner, previewBox, previewImgSize.width, previewImgSize.height, quarters, stats);
            }
          },
        },
        l === "de" ? "🇩🇪" : "🇬🇧"
      );
      if (lang === l) btn.classList.add("active");
      langSwitch.appendChild(btn);
    });

    // faction select label and element
    const rootLabel = el("label", { for: "faction-select", style: "font-weight:bold;margin-left:10px" }, "");
    const factionSelect = el("select", { id: "faction-select", style: "margin-left:10px;padding:8px" });
    function buildFactionOptions() {
      factionSelect.innerHTML = "";
      const emptyOpt = el("option", { value: "" }, translations[lang]?.chooseFaction || (lang === "de" ? "Fraktion wählen" : "Choose faction"));
      factionSelect.appendChild(emptyOpt);
      const factionList = Array.isArray(translations[lang]?.factions) ? translations[lang].factions : [];
      factionList.forEach((f) => {
        factionSelect.appendChild(el("option", { value: f }, f));
      });
    }
    buildFactionOptions();

    // stat input controls (numbers)
    const statControls = el("div", { style: "display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;margin-left:8px" });

    function makeStatInput(key, labelText) {
      // Configure input attributes per stat
      const attrs = {
        type: "number",
        value: "",
        placeholder: "",
        style: "width:6.2rem;padding:6px;border-radius:6px;border:1px solid #ccc",
        oninput: (e) => {
          let v = e.target.value;
          // allow empty
          if (v === "" || v == null) {
            stats[key] = "";
          } else {
            if (key === "save") {
              // save / health / control -> integers >= 0
              let n = parseInt(v, 10);
              if (Number.isNaN(n)) {
                stats[key] = "";
              } else {
                if (n < 1) n = 1;
                if (n > 6) n = 6;
                stats[key] = Math.floor(n);
              }
            } else {
              // save / health / control -> integers >= 0
              let n = parseInt(v, 10);
              if (Number.isNaN(n)) {
                stats[key] = "";
              } else {
                if (n < 0) n = 0;
                stats[key] = Math.floor(n);
              }
            }
          }
          // re-render overlay if image size known
          if (previewImgSize) {
            const quarters = translations[lang]?.quarters || {};
            renderQuarterLabels(previewInner, previewBox, previewImgSize.width, previewImgSize.height, quarters, stats);
          }
        },
      };

      // per-key input hints
      if (key === "move") {
        attrs.step = "1";
        attrs.min = "0";
        attrs.inputMode = "numeric";
        attrs.title = 'Move in inches (e.g. 6 or 6.5).';
      } else {
        attrs.step = "1";
        attrs.min = "0";
        attrs.inputMode = "numeric";
        attrs.title = key === "save" ? 'Save (integer, will be shown as e.g. "4+")' : 'Integer stat (>=0)';
      }

      const input = el("input", attrs);
      const label = el("label", { style: "display:flex;flex-direction:column;font-size:0.85rem" }, [
        el("span", {}, labelText),
        input,
      ]);
      return { label, input };
    }

    const moveLabelText = translations[lang]?.quarters?.top || (lang === "de" ? "BEWEGUNG" : "MOVE");
    const healthLabelText = translations[lang]?.quarters?.left || (lang === "de" ? "LEBEN" : "HEALTH");
    const saveLabelText = translations[lang]?.quarters?.right || (lang === "de" ? "RÜSTUNG" : "SAVE");
    const controlLabelText = translations[lang]?.quarters?.bottom || (lang === "de" ? "KONTROLLE" : "CONTROL");

    const moveInput = makeStatInput("move", moveLabelText);
    const healthInput = makeStatInput("health", healthLabelText);
    const saveInput = makeStatInput("save", saveLabelText);
    const controlInput = makeStatInput("control", controlLabelText);

    statControls.appendChild(moveInput.label);
    statControls.appendChild(healthInput.label);
    statControls.appendChild(saveInput.label);
    statControls.appendChild(controlInput.label);

    // preview & save
    const previewWrap = el("div", { id: "preview-wrap", style: "margin-top:1rem;text-align:center;" });

    // previewBox uses background-image CSS so browser shows it immediately.
    // We'll adjust the box dimensions to the image natural size once the image is loaded.
    const previewBox = el("div", {
      id: "warscroll-preview",
      style:
        'display:inline-block;padding:1rem;background:white;border:1px solid #ccc;border-radius:8px;min-width:320px;max-width:650px;overflow:hidden;position:relative;' +
        `background-image:url("${BACKGROUND_IMAGE}");background-size:cover;background-position:center;background-repeat:no-repeat;`,
    });
    previewWrap.appendChild(previewBox);

    // convenience: inner overlay container for text/padding inside the preview box
    const previewInner = el("div", { style: "position:relative;padding:1rem;box-sizing:border-box;width:100%;height:100%;display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;background:transparent;" });
    previewBox.appendChild(previewInner);

    let previewImgSize = null; // will store {width,height} when image loaded

    const saveBtn = el(
      "button",
      {
        type: "button",
        style: "display:block;margin:1rem auto;padding:0.6rem 1rem;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer",
      },
      ""
    );

    saveBtn.addEventListener("click", async () => {
      // Wait for the background image to load so we can export at the image's natural size
      let img = bgImage;
      try {
        if (!img) img = await bgLoadPromise;
      } catch (_) {
        img = bgImage; // may still be null
      }

      const width = img ? img.naturalWidth : DEFAULT_EXPORT_SIZE.width;
      const height = img ? img.naturalHeight : DEFAULT_EXPORT_SIZE.height;

      const title = previewTitle.textContent || (translations[lang]?.warscrollOf || (lang === "de" ? "Schriftrolle der" : "Warscroll of"));
      const canvas = drawWarscrollCanvas(title, width, height, img, {
        move: stats.move,
        health: stats.health,
        save: stats.save,
        control: stats.control,
      });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      const safe = (previewTitle.textContent || "warscroll").replace(/\s+/g, "-").toLowerCase();
      link.download = `${(translations[lang]?.warscrollOf || "warscroll").replace(/\s+/g, "_")}-${safe}.png`;
      link.click();
    });

    // preview title element (placed inside previewInner so it sits over the background)
    const previewTitle = el("h2", { style: "margin:0 0 8px 0;text-align:left;color:var(--title-color);width:100%" }, "");
    previewInner.appendChild(previewTitle);

    // small content area inside preview (placeholder, extendable)
    const previewContent = el("div", { style: "text-align:left;color:var(--text-color);width:100%" }, el("p", { className: "placeholder", style: "margin:0.5rem 0" }, ""));
    previewInner.appendChild(previewContent);

    // wire up select changes
    function updatePreview() {
      const f = factionSelect.value;
      if (!f) {
        previewTitle.textContent = "";
        previewContent.querySelector("p").textContent = translations[lang]?.chooseFaction || (lang === "de" ? "Fraktion wählen" : "Choose faction");
        saveBtn.style.display = "none";
      } else {
        previewTitle.textContent = `${translations[lang]?.warscrollOf || (lang === "de" ? "Schriftrolle der" : "Warscroll of")} ${f}`;
        previewContent.querySelector("p").textContent = `Example content for ${f}`;
        saveBtn.style.display = "block";
      }
      // If preview image already sized, re-render overlay to pick up any changes to translation texts or stats
      if (previewImgSize) {
        const quarters = translations[lang]?.quarters || {};
        renderQuarterLabels(previewInner, previewBox, previewImgSize.width, previewImgSize.height, quarters, stats);
      }
    }
    factionSelect.addEventListener("change", updatePreview);

    // initial text
    rootLabel.textContent = translations[lang]?.chooseFaction || (lang === "de" ? "Fraktion wählen" : "Choose faction");
    saveBtn.textContent = translations[lang]?.saveAsPng || (lang === "de" ? "Speichern" : "Save");

    // assemble elements: top row has language switch + faction + stat inputs
    const topRow = el("div", { style: "display:flex;align-items:center;gap:1rem;margin-bottom:1rem;flex-wrap:wrap" }, [
      langSwitch,
      rootLabel,
      factionSelect,
      statControls,
    ]);
    container.appendChild(topRow);
    container.appendChild(previewWrap);
    container.appendChild(saveBtn);

    ROOT.appendChild(container);

    // Once the background image is loaded, size the previewBox to the image natural dimensions
    bgLoadPromise.then((img) => {
      if (img && img.naturalWidth && img.naturalHeight) {
        previewImgSize = { width: img.naturalWidth, height: img.naturalHeight };
        // set preview box to image natural size (CSS pixels)
        previewBox.style.width = img.naturalWidth + "px";
        previewBox.style.height = img.naturalHeight + "px";
        // ensure the CSS background fits exactly the box
        previewBox.style.backgroundSize = `${img.naturalWidth}px ${img.naturalHeight}px`;
        // allow previewInner to fill the box
        previewInner.style.height = "100%";
        // Re-run update to ensure preview text is visible
        updatePreview();

        // render quarter labels using strings from translations[lang].quarters and show any stats
        const quarters = translations[lang]?.quarters || {};
        renderQuarterLabels(previewInner, previewBox, img.naturalWidth, img.naturalHeight, quarters, stats);
      } else {
        // fallback: keep previous sizing (max-width) and update preview
        updatePreview();
      }
    }).catch(() => {
      // image failed to load; keep fallback size
      updatePreview();
    });

    // set initial preview state
    updatePreview();
  }

  // convenience translator (safe fallback)
  function t(key) {
    return key;
  }

  bootstrap().catch((err) => console.error("Failed to start app:", err));
})();