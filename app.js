/* =========================================================
   SNAPBOX — app.js
   Vanilla JS, no build step, no external deps except qrcode.js (CDN).

   Sections:
   1. State & utils
   2. Navigation / step tracker
   3. Branding customizer
   4. Frame selector (built-in + custom upload)
   5. Camera (timer, flash, mirror, live effect, multi-shot capture)
   6. Edit (retake, filters, stickers, free text)
   7. Checkout / payment simulation (QRIS / e-wallet / card / cash)
   8. Result (compose final image, download JPG/PNG, email, QR code)
   ========================================================= */

(() => {
  "use strict";

  /* =========================================================
     1. STATE & UTILS
     ========================================================= */

  const STORAGE_KEY = "snapbox_branding_v1";
  const TRANSACTIONS_KEY = "snapbox_transactions_v1";

  // PIN pengaman ringan untuk layar Laporan — BUKAN keamanan tingkat tinggi,
  // cukup untuk mencegah pengunjung booth mengintip data penjualan.
  // Ganti angka ini kalau perlu, lalu simpan ulang file ini.
  const REPORT_PIN = "1234";

  const state = {
    branding: {
      name: "SNAPBOX",
      color: "#ff5b2e",
      tagline: "",
      logoDataUrl: null,
      bgDataUrl: null,
      qrisDataUrl: null,
    },
    layout: 1,
    frames: [],
    selectedFrameId: null,
    timerSeconds: 3,
    mirrored: true,
    flashOn: false,
    liveEffect: "none",
    shots: [],
    retakeTargetIndex: null,
    edit: {
      filter: "none",
      brightness: 100,
      contrast: 100,
      saturate: 100,
      stickers: [],
    },
    order: {
      code: null,
      basePrice: 15000,
      extraCopyPrice: 5000,
      extraCopies: 0,
      hqPrice: 10000,
      hqSelected: false,
      emailSelected: true,
      promoDiscountPct: 0,
      method: "qris",
      total: 0,
      email: "",
    },
    mediaStream: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function formatIDR(n) {
    return "Rp " + Math.round(n).toLocaleString("id-ID");
  }

  function genOrderCode() {
    return "SNB-" + Math.floor(100000 + Math.random() * 899999);
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-visible"), 2400);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function buildFilterCss({ filter, brightness, contrast, saturate }) {
    const presets = {
      none: "",
      bw: "grayscale(1)",
      warm: "sepia(0.25) saturate(1.25) hue-rotate(-8deg)",
      cool: "saturate(1.1) hue-rotate(12deg) brightness(1.03)",
      sepia: "sepia(0.65)",
      vivid: "saturate(1.5) contrast(1.08)",
    };
    const base = presets[filter] || "";
    return `${base} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`.trim();
  }

  /* =========================================================
     2. NAVIGATION
     ========================================================= */

  const STEP_ORDER = ["welcome", "branding", "frame", "camera", "edit", "checkout", "result"];

  function goTo(screenName) {
    $$(".screen").forEach(s => s.classList.toggle("is-active", s.dataset.screen === screenName));
    updateStepTracker(screenName);
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (screenName === "camera") initCameraScreenEnter();
    if (screenName === "edit") initEditScreenEnter();
    if (screenName === "checkout") initCheckoutScreenEnter();
    if (screenName === "result") initResultScreenEnter();
    if (screenName === "report") initReportScreenEnter();
    if (screenName !== "camera") stopCamera();
  }

  function updateStepTracker(current) {
    const idx = STEP_ORDER.indexOf(current);
    $$(".step").forEach(btn => {
      const sIdx = STEP_ORDER.indexOf(btn.dataset.step);
      btn.classList.toggle("is-current", btn.dataset.step === current);
      btn.classList.toggle("is-done", sIdx > -1 && sIdx < idx);
    });
  }

  $$(".step").forEach(btn => btn.addEventListener("click", () => goTo(btn.dataset.step)));
  $$("[data-nav]").forEach(btn => btn.addEventListener("click", () => goTo(btn.dataset.nav)));
  $$("[data-nav-back]").forEach(btn => {
    btn.addEventListener("click", () => {
      const current = $(".screen.is-active").dataset.screen;
      const idx = STEP_ORDER.indexOf(current);
      goTo(STEP_ORDER[Math.max(0, idx - 1)]);
    });
  });
  $("#btnStart").addEventListener("click", () => goTo("branding"));
  $("#adminToggle").addEventListener("click", () => goTo("branding"));
  /* =========================================================
     3. BRANDING CUSTOMIZER
     ========================================================= */

  const SWATCHES = ["#ff5b2e", "#2e8b57", "#2d5fff", "#c93b8e", "#ffb703", "#1c1410"];

  function renderSwatches() {
    const row = $("#swatchRow");
    row.innerHTML = "";
    SWATCHES.forEach(hex => {
      const b = document.createElement("button");
      b.className = "swatch";
      b.style.background = hex;
      b.dataset.hex = hex;
      b.type = "button";
      b.setAttribute("aria-label", "Pilih warna " + hex);
      if (hex.toLowerCase() === state.branding.color.toLowerCase()) b.classList.add("is-active");
      b.addEventListener("click", () => setBrandColor(hex));
      row.appendChild(b);
    });
  }

  function setBrandColor(hex) {
    state.branding.color = hex;
    document.documentElement.style.setProperty("--accent", hex);
    $$(".swatch").forEach(s => s.classList.toggle("is-active", s.dataset.hex.toLowerCase() === hex.toLowerCase()));
    $("#inputCustomColor").value = hex;
    saveBranding();
  }

  function applyBrandingToUI() {
    const b = state.branding;
    document.documentElement.style.setProperty("--accent", b.color);
    $("#brandNameLabel").textContent = b.name || "SNAPBOX";
    $("#miniPreviewBrand").textContent = b.name || "SNAPBOX";
    $("#miniPreviewTag").textContent = b.tagline || "";
    $("#inputBrandName").value = b.name === "SNAPBOX" ? "" : b.name;
    $("#inputTagline").value = b.tagline;
    $("#inputCustomColor").value = b.color;

    // Terapkan logo ke topbar (di samping nama brand)
    const topbarLogo = $("#topbarLogoImg");
    const topbarDot = $("#topbarDot");
    if (b.logoDataUrl && topbarLogo) {
      topbarLogo.src = b.logoDataUrl;
      topbarLogo.style.display = "inline-block";
      if (topbarDot) topbarDot.style.display = "none";
      $("#logoDropLabel").textContent = "Logo terpasang ✓";
      $("#logoDrop").classList.add("has-file");
    } else if (topbarLogo) {
      topbarLogo.src = "";
      topbarLogo.style.display = "none";
      if (topbarDot) topbarDot.style.display = "";
    }

    // Terapkan background image ke welcome screen
    const welcomeBg = $("#welcomeBgOverlay");
    if (b.bgDataUrl && welcomeBg) {
      welcomeBg.style.backgroundImage = `url(${b.bgDataUrl})`;
      welcomeBg.style.opacity = "1";
      $("#bgDropLabel").textContent = "Gambar latar terpasang ✓";
      $("#bgDrop").classList.add("has-file");
    } else if (welcomeBg) {
      welcomeBg.style.backgroundImage = "";
      welcomeBg.style.opacity = "0";
    }

    if (b.qrisDataUrl) {
      $("#qrisDropLabel").textContent = "QRIS asli terpasang ✓";
      $("#qrisDrop").classList.add("has-file");
    }
  }

  function saveBranding() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.branding)); } catch (e) {}
  }

  function loadBranding() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) Object.assign(state.branding, JSON.parse(raw));
    } catch (e) {}
  }

  $("#inputBrandName").addEventListener("input", e => {
    state.branding.name = e.target.value.trim() || "SNAPBOX";
    $("#brandNameLabel").textContent = state.branding.name;
    $("#miniPreviewBrand").textContent = state.branding.name;
    saveBranding();
  });

  $("#inputTagline").addEventListener("input", e => {
    state.branding.tagline = e.target.value;
    $("#miniPreviewTag").textContent = e.target.value;
    saveBranding();
  });

  $("#inputCustomColor").addEventListener("input", e => setBrandColor(e.target.value));

  $("#logoDrop").addEventListener("click", () => $("#inputLogo").click());
  $("#inputLogo").addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    state.branding.logoDataUrl = await fileToDataUrl(f);
    $("#logoDropLabel").textContent = "Logo terpasang ✓";
    $("#logoDrop").classList.add("has-file");
    // Terapkan ke topbar
    const topbarLogo = $("#topbarLogoImg");
    const topbarDot = $("#topbarDot");
    if (topbarLogo) {
      topbarLogo.src = state.branding.logoDataUrl;
      topbarLogo.style.display = "inline-block";
      if (topbarDot) topbarDot.style.display = "none";
    }
    saveBranding();
    toast("Logo brand disimpan");
  });

  $("#bgDrop").addEventListener("click", () => $("#inputBg").click());
  $("#inputBg").addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    state.branding.bgDataUrl = await fileToDataUrl(f);
    $("#bgDropLabel").textContent = "Gambar latar terpasang ✓";
    $("#bgDrop").classList.add("has-file");
    // Terapkan langsung ke welcome screen
    const welcomeBg = $("#welcomeBgOverlay");
    if (welcomeBg) {
      welcomeBg.style.backgroundImage = `url(${state.branding.bgDataUrl})`;
      welcomeBg.style.opacity = "1";
    }
    saveBranding();
    toast("Latar sambutan disimpan");
  });

  $("#qrisDrop").addEventListener("click", () => $("#inputQris").click());
  $("#inputQris").addEventListener("change", async e => {
    const f = e.target.files[0];
    if (!f) return;
    state.branding.qrisDataUrl = await fileToDataUrl(f);
    $("#qrisDropLabel").textContent = "QRIS asli terpasang ✓";
    $("#qrisDrop").classList.add("has-file");
    saveBranding();
    toast("QRIS pembayaran disimpan — akan dipakai saat checkout");
  });

  /* =========================================================
     4. FRAME SELECTOR
     ========================================================= */

  // Built-in frames are drawn procedurally via CSS/canvas border styles —
  // each entry describes how to render a border on top of the photo.
  const BUILTIN_FRAMES = [
    { id: "none", name: "Tanpa Frame", type: "builtin", style: "none" },
    { id: "polaroid", name: "Polaroid Klasik", type: "builtin", style: "polaroid" },
    { id: "filmstrip", name: "Film Strip", type: "builtin", style: "filmstrip" },
    { id: "neon", name: "Neon Outline", type: "builtin", style: "neon" },
    { id: "scallop", name: "Scallop Cute", type: "builtin", style: "scallop" },
    { id: "minimal", name: "Garis Minimal", type: "builtin", style: "minimal" },
    { id: "brand", name: "Brand Banner", type: "builtin", style: "brand" },
  ];

  function initFrameState() {
    state.frames = BUILTIN_FRAMES.map(f => ({ ...f }));
    state.selectedFrameId = "polaroid";
  }
  initFrameState();

  function frameSwatchStyle(frame) {
    // Returns inline style string for the little preview swatch in the grid
    const accent = state.branding.color;
    switch (frame.style) {
      case "none": return `background:#3a322c;`;
      case "polaroid": return `background:#fff; border:10px solid #fff; box-shadow:inset 0 0 0 1px rgba(0,0,0,0.08);`;
      case "filmstrip": return `background:#111; background-image: repeating-linear-gradient(to bottom, #fff 0 6px, transparent 6px 16px); background-size: 10px 16px; background-position: left center, right center; background-repeat: repeat-y;`;
      case "neon": return `background:#1a1a1a; box-shadow: inset 0 0 0 4px ${accent};`;
      case "scallop": return `background:#fdf6ec; box-shadow: inset 0 0 0 8px #fff, inset 0 0 0 9px ${accent};`;
      case "minimal": return `background:#222; box-shadow: inset 0 0 0 2px #fff;`;
      case "brand": return `background:${accent};`;
      default: return `background:#333;`;
    }
  }

  function renderFrameGrid() {
    const grid = $("#frameGrid");
    grid.innerHTML = "";
    state.frames.forEach(frame => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "frame-card" + (frame.id === state.selectedFrameId ? " is-selected" : "");
      card.dataset.frameId = frame.id;

      const swatch = document.createElement("div");
      swatch.className = "frame-card__swatch";
      if (frame.type === "custom" && frame.thumbUrl) {
        swatch.style.backgroundImage = `url(${frame.thumbUrl})`;
        swatch.style.backgroundSize = "cover";
        swatch.style.backgroundPosition = "center";
        swatch.style.backgroundRepeat = "no-repeat";
      } else {
        swatch.setAttribute("style", swatch.getAttribute("style") + frameSwatchStyle(frame));
      }

      const name = document.createElement("div");
      name.className = "frame-card__name";
      name.textContent = frame.name;

      card.appendChild(swatch);
      card.appendChild(name);

      if (frame.type === "custom") {
        const badge = document.createElement("span");
        badge.className = "frame-card__custom-badge";
        badge.textContent = "Custom";
        card.appendChild(badge);
      }

      card.addEventListener("click", () => selectFrame(frame.id));
      grid.appendChild(card);
    });
  }

  function selectFrame(id) {
    state.selectedFrameId = id;
    renderFrameGrid();
    $("#btnToCamera").disabled = false;
    renderChosenFramePreview();
  }

  function getSelectedFrame() {
    return state.frames.find(f => f.id === state.selectedFrameId) || state.frames[0];
  }

  $("#layoutToggle").addEventListener("click", e => {
    const btn = e.target.closest(".layout-toggle__btn");
    if (!btn) return;
    $$(".layout-toggle__btn").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.layout = parseInt(btn.dataset.layout, 10);
    state.shots = [];
  });

  $("#btnAddFrame").addEventListener("click", () => $("#inputAddFrame").click());
  $("#inputAddFrame").addEventListener("change", async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    for (const f of files) {
      const dataUrl = await fileToDataUrl(f);
      const id = "custom-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      state.frames.push({
        id, name: f.name.replace(/\.[^.]+$/, "").slice(0, 22) || "Frame Custom",
        type: "custom", thumbUrl: dataUrl, overlayUrl: dataUrl,
      });
    }
    renderFrameGrid();
    toast(files.length > 1 ? "Frame custom ditambahkan" : "Frame custom ditambahkan");
  });

  function renderChosenFramePreview() {
    const wrap = $("#chosenFramePreview");
    const frame = getSelectedFrame();
    wrap.innerHTML = "";
    if (frame.type === "custom") {
      const img = document.createElement("img");
      img.src = frame.thumbUrl;
      wrap.appendChild(img);
    } else {
      const div = document.createElement("div");
      div.style.width = "100%";
      div.style.aspectRatio = "3/4";
      div.style.borderRadius = "10px";
      div.setAttribute("style", div.getAttribute("style") + frameSwatchStyle(frame));
      wrap.appendChild(div);
    }
    const label = document.createElement("p");
    label.className = "hint-text";
    label.textContent = frame.name;
    wrap.appendChild(label);
  }

  /* =========================================================
     5. CAMERA
     ========================================================= */

  let countdownTimer = null;

  function initCameraScreenEnter() {
    renderChosenFramePreview();
    renderShotProgress();
    renderThumbRow();
    startCamera();
  }

  async function startCamera() {
    const status = $("#cameraStatus");
    status.style.opacity = "1";
    status.textContent = "Mengaktifkan kamera…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      state.mediaStream = stream;
      const video = $("#videoPreview");
      video.srcObject = stream;
      video.classList.toggle("is-mirrored", state.mirrored);
      status.textContent = "Kamera siap";
      setTimeout(() => { status.style.opacity = "0"; }, 1200);
    } catch (err) {
      status.style.opacity = "1";
      status.textContent = "Kamera tidak dapat diakses — izinkan akses kamera di browser.";
      toast("Gagal mengakses kamera. Periksa izin kamera browser.");
    }
  }

  function stopCamera() {
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(t => t.stop());
      state.mediaStream = null;
    }
  }

  $("#btnMirror").addEventListener("click", () => {
    state.mirrored = !state.mirrored;
    $("#videoPreview").classList.toggle("is-mirrored", state.mirrored);
    $("#btnMirror").classList.toggle("is-on", state.mirrored);
  });
  $("#btnMirror").classList.add("is-on"); // default mirrored = true

  $("#btnFlashToggle").addEventListener("click", () => {
    state.flashOn = !state.flashOn;
    $("#btnFlashToggle").classList.toggle("is-on", state.flashOn);
    toast(state.flashOn ? "Flash layar diaktifkan" : "Flash layar dimatikan");
  });

  $("#timerGroup").addEventListener("click", e => {
    const btn = e.target.closest(".timer-pill");
    if (!btn) return;
    $$(".timer-pill").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.timerSeconds = parseInt(btn.dataset.timer, 10);
  });

  $("#liveEffectSelect").addEventListener("change", e => {
    state.liveEffect = e.target.value;
    const css = buildFilterCss({ filter: state.liveEffect, brightness: 100, contrast: 100, saturate: 100 });
    $("#videoPreview").style.filter = css;
  });

  function renderShotProgress() {
    const wrap = $("#shotProgress");
    wrap.innerHTML = "";
    for (let i = 0; i < state.layout; i++) {
      const span = document.createElement("span");
      if (state.shots[i]) span.classList.add("is-filled");
      wrap.appendChild(span);
    }
    const remaining = state.layout - state.shots.length;
    $("#shotCounterLabel").textContent = remaining > 0
      ? `${state.shots.length}/${state.layout} foto terambil — ${remaining} lagi`
      : `${state.layout}/${state.layout} foto selesai`;
    $("#btnToEdit").disabled = state.shots.length < state.layout;
  }

  function renderThumbRow() {
    const row = $("#thumbRow");
    row.innerHTML = "";
    if (!state.shots.length) {
      const p = document.createElement("p");
      p.className = "hint-text";
      p.textContent = "Belum ada foto. Tekan tombol jepret untuk mulai.";
      row.appendChild(p);
      return;
    }
    state.shots.forEach((src, i) => {
      const img = document.createElement("img");
      img.src = src;
      img.className = "thumb";
      img.title = "Foto " + (i + 1);
      row.appendChild(img);
    });
  }

  $("#btnShutter").addEventListener("click", () => {
    if (state.shots.length >= state.layout) {
      toast("Semua foto sudah terambil. Lanjut ke edit, atau retake di sana.");
      return;
    }
    if (state.timerSeconds === 0) {
      capturePhoto();
    } else {
      runCountdown(state.timerSeconds, capturePhoto);
    }
  });

  function runCountdown(seconds, onDone) {
    const numEl = $("#countdownNum");
    $("#btnShutter").disabled = true;
    let n = seconds;
    const tick = () => {
      numEl.textContent = n > 0 ? n : "📸";
      numEl.classList.remove("is-showing");
      void numEl.offsetWidth; // restart animation
      numEl.classList.add("is-showing");
      if (n === 0) {
        clearInterval(countdownTimer);
        $("#btnShutter").disabled = false;
        onDone();
        return;
      }
      n--;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function capturePhoto() {
    const video = $("#videoPreview");
    if (!video.videoWidth) {
      toast("Kamera belum siap, coba lagi sebentar.");
      return;
    }

    if (state.flashOn) {
      const flash = $("#flashPop");
      flash.classList.remove("is-firing");
      void flash.offsetWidth;
      flash.classList.add("is-firing");
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    ctx.save();
    if (state.mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.filter = buildFilterCss({ filter: state.liveEffect, brightness: 100, contrast: 100, saturate: 100 }) || "none";
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/png");

    const wasRetake = state.retakeTargetIndex !== null && state.retakeTargetIndex !== undefined;
    if (wasRetake) {
      state.shots[state.retakeTargetIndex] = dataUrl;
      state.retakeTargetIndex = null;
      state.retakeSelectedIndex = null;
      renderShotProgress();
      renderThumbRow();
      toast("Foto berhasil diambil ulang");
      setTimeout(() => goTo("edit"), 500);
      return;
    }

    state.shots.push(dataUrl);
    renderShotProgress();
    renderThumbRow();
  }

  /* =========================================================
     6. EDIT SCREEN
     ========================================================= */

  const FILTERS = [
    { id: "none", label: "Normal" },
    { id: "bw", label: "Hitam Putih" },
    { id: "warm", label: "Hangat" },
    { id: "cool", label: "Sejuk" },
    { id: "sepia", label: "Sepia" },
    { id: "vivid", label: "Vivid" },
  ];
  const STICKERS = ["✨", "💖", "🎉", "😂", "🔥", "🌸", "👑", "🍀", "⭐", "🎈", "😎", "🥳"];

  let editCanvasEl, editCtx;
  let stickerDragState = null;

  function initEditScreenEnter() {
    renderRetakeThumbs();
    renderFilterGrid();
    renderStickerPalette();
    layoutAndDrawEditCanvas();
  }

  function renderFilterGrid() {
    const grid = $("#filterGrid");
    grid.innerHTML = "";
    FILTERS.forEach(f => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "filter-chip" + (f.id === state.edit.filter ? " is-active" : "");
      chip.textContent = f.label;
      chip.addEventListener("click", () => {
        state.edit.filter = f.id;
        $$(".filter-chip").forEach(c => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        layoutAndDrawEditCanvas();
      });
      grid.appendChild(chip);
    });
  }

  ["rangeBrightness", "rangeContrast", "rangeSaturate"].forEach(id => {
    $("#" + id).addEventListener("input", e => {
      const key = id.replace("range", "").toLowerCase();
      state.edit[key] = parseInt(e.target.value, 10);
      layoutAndDrawEditCanvas();
    });
  });

  function renderStickerPalette() {
    const grid = $("#stickerPalette");
    grid.innerHTML = "";
    STICKERS.forEach(emo => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = emo;
      b.addEventListener("click", () => addSticker({ emoji: emo }));
      grid.appendChild(b);
    });
  }

  $("#btnAddText").addEventListener("click", () => {
    const text = $("#inputStickerText").value.trim();
    if (!text) { toast("Tulis teks dulu ya"); return; }
    addSticker({
      text,
      font: $("#selectTextFont").value,
      color: $("#inputTextColor").value,
    });
    $("#inputStickerText").value = "";
  });

  function addSticker(opts) {
    const id = "st-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    state.edit.stickers.push({
      id,
      x: 0.5, y: 0.5,
      emoji: opts.emoji || null,
      text: opts.text || null,
      font: opts.font || "'Fraunces', serif",
      color: opts.color || "#ffffff",
    });
    renderStickerLayer();
  }

  function renderStickerLayer() {
    const layer = $("#stickerLayer");
    layer.innerHTML = "";
    state.edit.stickers.forEach(st => {
      const el = document.createElement("div");
      el.className = "sticker-item" + (st.text ? " is-text" : "");
      el.style.left = (st.x * 100) + "%";
      el.style.top = (st.y * 100) + "%";
      el.style.transform = "translate(-50%,-50%)";
      if (st.text) {
        el.textContent = st.text;
        el.style.fontFamily = st.font;
        el.style.color = st.color;
      } else {
        el.textContent = st.emoji;
      }
      el.addEventListener("pointerdown", ev => startStickerDrag(ev, st.id));
      el.addEventListener("dblclick", () => removeSticker(st.id));
      layer.appendChild(el);
    });
  }

  function removeSticker(id) {
    state.edit.stickers = state.edit.stickers.filter(s => s.id !== id);
    renderStickerLayer();
  }

  function startStickerDrag(ev, id) {
    ev.preventDefault();
    const layer = $("#stickerLayer");
    const rect = layer.getBoundingClientRect();
    stickerDragState = { id, rect };
    const move = e => {
      const x = clamp((e.clientX - rect.left) / rect.width, 0.03, 0.97);
      const y = clamp((e.clientY - rect.top) / rect.height, 0.03, 0.97);
      const st = state.edit.stickers.find(s => s.id === id);
      if (!st) return;
      st.x = x; st.y = y;
      renderStickerLayer();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      stickerDragState = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  $("#editTabs").addEventListener("click", e => {
    const tab = e.target.closest(".edit-tab");
    if (!tab) return;
    $$(".edit-tab").forEach(t => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    $$(".edit-panel").forEach(p => p.hidden = p.dataset.panel !== tab.dataset.tab);
  });

  function renderRetakeThumbs() {
    const row = $("#retakeThumbRow");
    row.innerHTML = "";
    state.shots.forEach((src, i) => {
      const img = document.createElement("img");
      img.src = src;
      img.className = "thumb" + (i === state.retakeSelectedIndex ? " is-selected" : "");
      img.addEventListener("click", () => {
        state.retakeSelectedIndex = i;
        renderRetakeThumbs();
      });
      row.appendChild(img);
    });
  }

  $("#btnRetakeGo").addEventListener("click", () => {
    if (state.retakeSelectedIndex === undefined || state.retakeSelectedIndex === null) {
      toast("Pilih dulu foto yang mau diambil ulang");
      return;
    }
    state.retakeTargetIndex = state.retakeSelectedIndex;
    goTo("camera");
    toast("Ambil ulang foto #" + (state.retakeSelectedIndex + 1));
  });

  // ---- Compose final framed image onto editCanvas ----

  async function layoutAndDrawEditCanvas() {
    editCanvasEl = $("#editCanvas");
    editCtx = editCanvasEl.getContext("2d");
    await drawComposedPhoto(editCanvasEl, editCtx);
    syncStickerLayerToCanvas();
    renderStickerLayer();
  }

  // Keeps the absolutely-positioned sticker layer pixel-aligned with the
  // canvas's rendered (CSS) box, since the canvas scales via max-width/max-height.
  function syncStickerLayerToCanvas() {
    const canvas = $("#editCanvas");
    const layer = $("#stickerLayer");
    const wrap = $(".edit-canvas-wrap");
    const cRect = canvas.getBoundingClientRect();
    const wRect = wrap.getBoundingClientRect();
    layer.style.left = (cRect.left - wRect.left) + "px";
    layer.style.top = (cRect.top - wRect.top) + "px";
    layer.style.width = cRect.width + "px";
    layer.style.height = cRect.height + "px";
  }

  window.addEventListener("resize", () => {
    if ($(".screen[data-screen='edit']").classList.contains("is-active")) {
      syncStickerLayerToCanvas();
      renderStickerLayer();
    }
  });

  // Shared composer used by both the edit screen and the final result screen.
  async function drawComposedPhoto(canvas, ctx) {
    const frame = getSelectedFrame();
    const cellW = 640, cellH = 480, gap = 18, pad = 28;
    const cols = state.layout === 4 ? 2 : (state.layout === 2 ? 2 : 1);
    const rows = state.layout === 4 ? 2 : (state.layout === 2 ? 1 : state.layout);

    const stageW = cols * cellW + (cols - 1) * gap + pad * 2;
    const stageH = rows * cellH + (rows - 1) * gap + pad * 2 + (frame.style === "brand" ? 70 : 0);

    canvas.width = stageW;
    canvas.height = stageH;

    // Background: white-ish frame mat, or themed per style
    ctx.fillStyle = frame.style === "filmstrip" ? "#111315" : "#fdfaf4";
    ctx.fillRect(0, 0, stageW, stageH);

    const images = await Promise.all(state.shots.map(src => loadImage(src)));

    for (let i = 0; i < state.layout; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = pad + col * (cellW + gap);
      const y = pad + row * (cellH + gap);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cellW, cellH);
      ctx.clip();
      ctx.filter = buildFilterCss(state.edit) || "none";
      const img = images[i];
      if (img) {
        // cover-fit
        const ir = img.width / img.height, cr = cellW / cellH;
        let dw, dh;
        if (ir > cr) { dh = cellH; dw = dh * ir; } else { dw = cellW; dh = dw / ir; }
        ctx.drawImage(img, x + (cellW - dw) / 2, y + (cellH - dh) / 2, dw, dh);
      }
      ctx.restore();
      drawCellFrame(ctx, frame, x, y, cellW, cellH);
    }

    drawOuterFrameDecor(ctx, frame, stageW, stageH);
    drawStickersOnCanvas(ctx, stageW, stageH);
  }

  function drawCellFrame(ctx, frame, x, y, w, h) {
    ctx.save();
    switch (frame.style) {
      case "neon":
        ctx.strokeStyle = state.branding.color;
        ctx.lineWidth = 8;
        ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
        break;
      case "minimal":
        ctx.strokeStyle = "#1c1410";
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
        break;
      case "scallop":
        ctx.strokeStyle = state.branding.color;
        ctx.lineWidth = 6;
        ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
        break;
      case "custom":
        break;
      default:
        break;
    }
    ctx.restore();

    if (frame.type === "custom" && frame.overlayUrl) {
      // overlay PNG drawn once at the end via drawOuterFrameDecor per-cell is complex;
      // simplest robust approach: draw overlay stretched over each cell here using a cached image.
      if (!frame._img) {
        frame._img = new Image();
        frame._img.src = frame.overlayUrl;
      }
      if (frame._img.complete && frame._img.naturalWidth) {
        ctx.drawImage(frame._img, x, y, w, h);
      }
    }
  }

  function drawOuterFrameDecor(ctx, frame, stageW, stageH) {
    ctx.save();
    if (frame.style === "filmstrip") {
      ctx.fillStyle = "#fff";
      const holeR = 7, gapY = 26, marginX = 11;
      for (let yy = 14; yy < stageH - 10; yy += gapY) {
        ctx.beginPath(); ctx.arc(marginX, yy, holeR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(stageW - marginX, yy, holeR, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (frame.style === "brand") {
      ctx.fillStyle = state.branding.color;
      ctx.fillRect(0, stageH - 70, stageW, 70);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 30px 'Fraunces', serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(state.branding.name || "SNAPBOX", stageW / 2, stageH - 35);
    }
    if (frame.style === "polaroid") {
      ctx.fillStyle = "#1c1410";
      ctx.font = "italic 500 22px 'Fraunces', serif";
      ctx.textAlign = "center";
      ctx.fillText(state.branding.tagline || state.branding.name, stageW / 2, stageH - 14);
    }
    ctx.restore();
  }

  function drawStickersOnCanvas(ctx, stageW, stageH) {
    state.edit.stickers.forEach(st => {
      const x = st.x * stageW;
      const y = st.y * stageH;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (st.text) {
        ctx.font = `600 34px ${st.font}`;
        ctx.fillStyle = st.color;
        ctx.fillText(st.text, x, y);
      } else if (st.emoji) {
        ctx.font = "56px sans-serif";
        ctx.fillText(st.emoji, x, y);
      }
      ctx.restore();
    });
  }

  /* =========================================================
     7. CHECKOUT / PAYMENT SIMULATION
     ========================================================= */

  const PROMO_CODES = {
    "KWU2026": 20,
    "SNAPBOX10": 10,
    "MAHASISWA": 15,
  };

  function initCheckoutScreenEnter() {
    const layoutLabels = { 1: "1 foto", 2: "2 foto", 3: "Strip 3 foto", 4: "Grid 4 foto" };
    $("#sumFrameLayout").textContent = layoutLabels[state.layout] || `${state.layout} foto`;
    recalcTotal();
    renderQris();
    $("#cashOrderCode").textContent = "Menunggu konfirmasi…";
  }

  function recalcTotal() {
    const o = state.order;
    let total = o.basePrice + o.extraCopies * o.extraCopyPrice;
    if (o.hqSelected) total += o.hqPrice;
    if (o.promoDiscountPct) total -= total * (o.promoDiscountPct / 100);
    o.total = Math.max(0, Math.round(total));

    $("#sumBasePrice").textContent = formatIDR(o.basePrice);
    $("#qtyValue").textContent = o.extraCopies;
    $("#priceAddonHQ").textContent = o.hqSelected ? formatIDR(o.hqPrice) : formatIDR(0);
    $("#priceAddonEmail").textContent = "Gratis";
    $("#sumTotal").textContent = formatIDR(o.total);
    renderQris();
  }

  $("#btnQtyMinus").addEventListener("click", () => {
    state.order.extraCopies = Math.max(0, state.order.extraCopies - 1);
    recalcTotal();
  });
  $("#btnQtyPlus").addEventListener("click", () => {
    state.order.extraCopies = Math.min(10, state.order.extraCopies + 1);
    recalcTotal();
  });
  $("#addonDigitalHQ").addEventListener("change", e => {
    state.order.hqSelected = e.target.checked;
    recalcTotal();
  });
  $("#addonEmail").addEventListener("change", e => { state.order.emailSelected = e.target.checked; });

  $("#btnApplyPromo").addEventListener("click", () => {
    const code = $("#inputPromo").value.trim().toUpperCase();
    if (!code) return;
    if (PROMO_CODES[code]) {
      state.order.promoDiscountPct = PROMO_CODES[code];
      $("#promoMsg").textContent = `Promo "${code}" diterapkan: diskon ${PROMO_CODES[code]}%`;
      $("#promoMsg").style.color = "var(--success)";
      toast("Kode promo berhasil dipakai");
    } else {
      state.order.promoDiscountPct = 0;
      $("#promoMsg").textContent = "Kode promo tidak ditemukan";
      $("#promoMsg").style.color = "var(--danger)";
    }
    recalcTotal();
  });

  $("#payMethods").addEventListener("click", e => {
    const btn = e.target.closest(".pay-method");
    if (!btn) return;
    $$(".pay-method").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    state.order.method = btn.dataset.method;

    $("#payDetailQris").hidden = state.order.method !== "qris";
    $("#payDetailEwallet").hidden = state.order.method !== "ewallet";
    $("#payDetailCard").hidden = state.order.method !== "card";
    $("#payDetailCash").hidden = state.order.method !== "cash";

    if (state.order.method === "cash") {
      if (!state.order.code) state.order.code = genOrderCode();
      $("#cashOrderCode").textContent = state.order.code;
    }
  });

  $("#payDetailEwallet").addEventListener("click", e => {
    const chip = e.target.closest(".ewallet-chip");
    if (!chip) return;
    $$(".ewallet-chip").forEach(c => c.classList.remove("is-active"));
    chip.classList.add("is-active");
  });

  $("#inputCardNumber").addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 16);
    e.target.value = v.replace(/(.{4})/g, "$1 ").trim();
  });
  $("#inputCardExpiry").addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
    e.target.value = v;
  });

  function renderQris() {
    const box = $("#qrisCodeBox");
    box.innerHTML = "";

    if (state.branding.qrisDataUrl) {
      const img = document.createElement("img");
      img.src = state.branding.qrisDataUrl;
      img.style.maxWidth = "220px";
      img.style.borderRadius = "8px";
      box.appendChild(img);
      $("#qrisRealNotice").hidden = false;
      $("#qrisDummyNotice").hidden = true;
      return;
    }

    $("#qrisRealNotice").hidden = true;
    $("#qrisDummyNotice").hidden = false;
    const payload = `SNAPBOX|ORDER-PENDING|TOTAL:${state.order.total}|${Date.now()}`;
    if (window.QRCode) {
      QRCode.toCanvas(document.createElement("canvas"), payload, { width: 180, margin: 1 }, (err, canvas) => {
        if (!err) box.appendChild(canvas);
      });
    } else {
      box.textContent = "QR tidak tersedia (offline)";
    }
  }

  $("#btnPayNow").addEventListener("click", () => {
    const email = $("#inputCheckoutEmail").value.trim();
    if (state.order.emailSelected && !email) {
      toast("Isi email penerima dulu, atau matikan opsi kirim email");
      return;
    }
    state.order.email = email;
    state.order.code = state.order.code || genOrderCode();

    const btn = $("#btnPayNow");
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Memproses pembayaran…";

    // Simulated payment processing delay — swap this block for a real
    // payment gateway call (see README.md "Integrasi Pembayaran Sungguhan").
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = originalText;
      recordTransaction();
      toast("Pembayaran berhasil ✓");
      goTo("result");
    }, 1400);
  });

  /* =========================================================
     8. RESULT SCREEN
     ========================================================= */

  async function initResultScreenEnter() {
    $("#resultOrderCode").textContent = state.order.code || genOrderCode();
    $("#inputResultEmail").value = state.order.email || "";
    const canvas = $("#resultCanvas");
    const ctx = canvas.getContext("2d");
    await drawComposedPhoto(canvas, ctx);
    renderResultQr();
  }

  function renderResultQr() {
    const box = $("#resultQrBox");
    const notice = $("#qrResultNotice");
    box.innerHTML = "";
    const canvas = $("#resultCanvas");

    // Kompres foto ke ukuran sangat kecil agar muat di QR
    // QR code punya batas ~2400 karakter untuk data URL
    function getCompactDataUrl(quality, maxDim) {
      const tmpCanvas = document.createElement("canvas");
      const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
      tmpCanvas.width = Math.floor(canvas.width * scale);
      tmpCanvas.height = Math.floor(canvas.height * scale);
      tmpCanvas.getContext("2d").drawImage(canvas, 0, 0, tmpCanvas.width, tmpCanvas.height);
      return tmpCanvas.toDataURL("image/jpeg", quality);
    }

    // Coba beberapa level kompresi sampai muat
    let compactDataUrl = null;
    const attempts = [
      { quality: 0.3, maxDim: 200 },
      { quality: 0.2, maxDim: 150 },
      { quality: 0.1, maxDim: 120 },
    ];
    for (const a of attempts) {
      const url = getCompactDataUrl(a.quality, a.maxDim);
      if (url.length < 2400) { compactDataUrl = url; break; }
    }

    if (window.QRCode && compactDataUrl) {
      QRCode.toCanvas(document.createElement("canvas"), compactDataUrl, { width: 180, margin: 1 }, (err, qrCanvas) => {
        if (!err) {
          box.appendChild(qrCanvas);
          notice.textContent = "Pindai untuk membuka foto langsung di HP.";
        } else {
          showQrFallback();
        }
      });
    } else {
      showQrFallback();
    }

    function showQrFallback() {
      box.innerHTML = "";
      const p = document.createElement("p");
      p.className = "hint-text";
      p.style.maxWidth = "200px";
      p.textContent = "Foto ini terlalu besar untuk dimuat ke QR. Gunakan tombol Unduh JPG/PNG di perangkat ini, atau kirim ke email.";
      box.appendChild(p);
    }
  }

  function downloadCanvasAs(format) {
    const canvas = $("#resultCanvas");
    const mime = format === "jpg" ? "image/jpeg" : "image/png";
    const ext = format === "jpg" ? "jpg" : "png";
    const url = canvas.toDataURL(mime, 0.92);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(state.branding.name || "snapbox").replace(/\s+/g, "_")}_${state.order.code || "foto"}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(`Foto diunduh sebagai .${ext.toUpperCase()}`);
  }

  $("#btnDownloadJpg").addEventListener("click", () => downloadCanvasAs("jpg"));
  $("#btnDownloadPng").addEventListener("click", () => downloadCanvasAs("png"));

  // ---------------------------------------------------------------------
  // Kirim email lewat backend Resend sendiri.
  //
  // Resend (sama seperti penyedia email transaksional lainnya) TIDAK BISA
  // dipanggil langsung dari browser dengan aman — API key harus disimpan di
  // server, bukan di kode yang bisa dibaca lewat DevTools. Karena itu tombol
  // "Kirim" di sini memanggil backend kecil (folder /server di project ini)
  // yang baru memanggil Resend dari sisi server. Selama backend itu belum
  // dijalankan / API_BASE_URL masih kosong, sistem otomatis jatuh ke mode
  // simulasi supaya tombolnya tidak error.
  //
  // Cara mengaktifkan: lihat README.md bagian "Mengaktifkan kirim email
  // via Resend".
  // ---------------------------------------------------------------------
  const API_BASE_URL = "http://localhost:4000"; // contoh setelah dijalankan: "http://localhost:4000"

  $("#btnSendEmail").addEventListener("click", async () => {
    const email = $("#inputResultEmail").value.trim();
    const statusEl = $("#emailStatusMsg");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      statusEl.textContent = "Masukkan alamat email yang valid.";
      statusEl.style.color = "var(--danger)";
      return;
    }
    statusEl.textContent = "Mengirim ke " + email + "…";
    statusEl.style.color = "rgba(247,241,230,0.45)";

    if (!API_BASE_URL) {
      // Mode simulasi (default selama backend belum disambungkan) —
      // lihat README.md bagian "Mengaktifkan kirim email via Resend".
      setTimeout(() => {
        statusEl.textContent = "Terkirim ke " + email + " ✓ (mode simulasi — lihat README untuk aktifkan Resend sungguhan)";
        statusEl.style.color = "var(--success)";
        toast("Email terkirim (simulasi)");
      }, 1200);
      return;
    }

    try {
      const photoDataUrl = $("#resultCanvas").toDataURL("image/jpeg", 0.85);
      const res = await fetch(API_BASE_URL + "/api/send-photo-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toEmail: email,
          brandName: state.branding.name || "SNAPBOX",
          orderCode: state.order.code || "-",
          photoDataUrl,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        statusEl.textContent = "Email terkirim ke " + email + " ✓ (lewat Resend)";
        statusEl.style.color = "var(--success)";
        toast("Email terkirim");
      } else {
        throw new Error(data.error || "Gagal mengirim email.");
      }
    } catch (err) {
      statusEl.textContent = "Gagal mengirim email — periksa apakah backend sedang berjalan.";
      statusEl.style.color = "var(--danger)";
      toast("Pengiriman email gagal");
    }
  });

  $("#btnNewSession").addEventListener("click", () => {
    state.shots = [];
    state.edit.stickers = [];
    state.edit.filter = "none";
    state.edit.brightness = 100;
    state.edit.contrast = 100;
    state.edit.saturate = 100;
    state.order.extraCopies = 0;
    state.order.hqSelected = false;
    state.order.promoDiscountPct = 0;
    state.order.code = null;
    state.order.email = "";
    state.retakeTargetIndex = null;
    state.retakeSelectedIndex = null;

    $("#rangeBrightness").value = 100;
    $("#rangeContrast").value = 100;
    $("#rangeSaturate").value = 100;
    $("#addonDigitalHQ").checked = false;
    $("#inputPromo").value = "";
    $("#promoMsg").textContent = "";
    $("#inputCheckoutEmail").value = "";
    $("#inputResultEmail").value = "";
    $("#emailStatusMsg").textContent = "";

    goTo("welcome");
  });

  /* =========================================================
     9. LAPORAN TRANSAKSI
     ========================================================= */

  let reportUnlocked = false;
  let reportFilterDateStr = "";

  function loadTransactions() {
    try {
      const raw = localStorage.getItem(TRANSACTIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveTransactions(list) {
    try { localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(list)); } catch (e) {}
  }

  // Dipanggil tepat setelah pembayaran dianggap berhasil (lihat btnPayNow).
  function recordTransaction() {
    const list = loadTransactions();
    list.push({
      timestamp: Date.now(),
      orderCode: state.order.code,
      layout: state.layout,
      method: state.order.method,
      email: state.order.email || "-",
      total: state.order.total,
    });
    saveTransactions(list);
  }

  const METHOD_LABELS = {
    qris: "QRIS",
    ewallet: "E-Wallet",
    card: "Kartu",
    cash: "Tunai",
  };

  function initReportScreenEnter() {
    reportUnlocked = false;
    $("#reportGate").hidden = false;
    $("#reportContent").hidden = true;
    $("#inputReportPin").value = "";
    $("#reportPinError").textContent = "";
    setTimeout(() => $("#inputReportPin").focus(), 50);
  }

  function unlockReport() {
    const pin = $("#inputReportPin").value.trim();
    if (pin !== REPORT_PIN) {
      $("#reportPinError").textContent = "PIN salah. Coba lagi.";
      $("#inputReportPin").value = "";
      $("#inputReportPin").focus();
      return;
    }
    reportUnlocked = true;
    $("#reportGate").hidden = true;
    $("#reportContent").hidden = false;
    renderReport();
  }

  $("#btnReportUnlock").addEventListener("click", unlockReport);
  $("#inputReportPin").addEventListener("keydown", e => {
    if (e.key === "Enter") unlockReport();
  });
  $("#btnReportLock").addEventListener("click", () => {
    reportUnlocked = false;
    initReportScreenEnter();
  });

  function getFilteredTransactions() {
    const list = loadTransactions().sort((a, b) => b.timestamp - a.timestamp);
    if (!reportFilterDateStr) return list;
    return list.filter(tx => {
      const d = new Date(tx.timestamp);
      const dStr = d.toISOString().slice(0, 10);
      return dStr === reportFilterDateStr;
    });
  }

  function renderReport() {
    const list = getFilteredTransactions();
    const tbody = $("#reportTableBody");
    tbody.innerHTML = "";

    $("#reportEmptyMsg").hidden = list.length > 0;
    $("#reportTable").style.display = list.length > 0 ? "" : "none";

    let totalRevenue = 0;
    const methodCount = {};

    const escapeHtml = (str) => String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    list.forEach(tx => {
      totalRevenue += tx.total;
      methodCount[tx.method] = (methodCount[tx.method] || 0) + 1;

      const tr = document.createElement("tr");
      const d = new Date(tx.timestamp);
      const dateLabel = d.toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      tr.innerHTML = `
        <td>${escapeHtml(dateLabel)}</td>
        <td>${escapeHtml(tx.orderCode)}</td>
        <td>${escapeHtml(tx.layout)} foto</td>
        <td>${escapeHtml(METHOD_LABELS[tx.method] || tx.method)}</td>
        <td>${escapeHtml(tx.email)}</td>
        <td>${formatIDR(tx.total)}</td>
      `;
      tbody.appendChild(tr);
    });

    $("#repTotalCount").textContent = list.length;
    $("#repTotalRevenue").textContent = formatIDR(totalRevenue);
    $("#repAvgRevenue").textContent = formatIDR(list.length ? totalRevenue / list.length : 0);

    let topMethod = "—";
    let topCount = 0;
    Object.entries(methodCount).forEach(([m, c]) => {
      if (c > topCount) { topCount = c; topMethod = METHOD_LABELS[m] || m; }
    });
    $("#repTopMethod").textContent = topMethod;
  }

  $("#reportFilterDate").addEventListener("change", e => {
    reportFilterDateStr = e.target.value;
    renderReport();
  });
  $("#btnReportClearFilter").addEventListener("click", () => {
    reportFilterDateStr = "";
    $("#reportFilterDate").value = "";
    renderReport();
  });

  $("#btnReportReset").addEventListener("click", () => {
    if (!confirm("Hapus semua data transaksi dari perangkat ini? Tindakan ini tidak bisa dibatalkan.")) return;
    saveTransactions([]);
    renderReport();
    toast("Data transaksi dihapus");
  });

  function downloadTextFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  $("#btnExportCsv").addEventListener("click", () => {
    const list = getFilteredTransactions();
    if (!list.length) {
      toast("Tidak ada data untuk diexport");
      return;
    }
    const header = ["Tanggal", "Kode Pesanan", "Layout", "Metode Bayar", "Email", "Total (Rp)"];
    const rows = list.map(tx => {
      const d = new Date(tx.timestamp);
      const dateStr = d.toLocaleString("id-ID");
      // CSV-escape: bungkus dengan tanda kutip dan dobelkan kutip internal jika ada
      const esc = v => `"${String(v).replace(/"/g, '""')}"`;
      return [
        esc(dateStr),
        esc(tx.orderCode),
        esc(tx.layout + " foto"),
        esc(METHOD_LABELS[tx.method] || tx.method),
        esc(tx.email),
        tx.total,
      ].join(",");
    });
    // \uFEFF (BOM) di awal supaya Excel langsung kenali UTF-8 dengan benar
    const csv = "\uFEFF" + [header.join(","), ...rows].join("\r\n");
    const filename = `laporan-transaksi-${state.branding.name.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(filename, csv, "text/csv;charset=utf-8;");
    toast("Laporan CSV diunduh — bisa dibuka langsung di Excel");
  });

  /* =========================================================
     INIT
     ========================================================= */

  loadBranding();
  renderSwatches();
  applyBrandingToUI();
  renderFrameGrid();
  renderChosenFramePreview();

})();
