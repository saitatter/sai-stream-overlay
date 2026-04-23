import { DEFAULTS, GOOGLE_FONTS } from "./constants.js";
import { hexToRgb, safeNumber } from "./utils.js";

function loadGoogleFont(fontName) {
  const existingLink = document.getElementById("google-font-link");
  if (existingLink) existingLink.remove();

  const link = document.createElement("link");
  link.id = "google-font-link";
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, "+")}&display=swap`;
  document.head.appendChild(link);
}

function setFont(fontName) {
  loadGoogleFont(fontName);
  document.documentElement.style.setProperty(
    "--chat-font-family",
    `'${fontName}', "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`,
  );
}

export function setupSettings(dom) {
  const params = new URLSearchParams(window.location.search);
  const isEdit = (params.get("edit") || "false").toLowerCase() === "true";
  let fadeTimeMs = safeNumber(DEFAULTS.fadeTime, 10) * 1000;

  GOOGLE_FONTS.forEach((font) => {
    const option = document.createElement("option");
    option.value = font;
    option.textContent = font;
    dom.fontSelect.appendChild(option);
  });

  dom.twitchColorInput.value = params.get("twitchColor") || DEFAULTS.twitchColor;
  dom.youtubeColorInput.value = params.get("youtubeColor") || DEFAULTS.youtubeColor;
  dom.fadeTimeInput.value = params.get("fadeTime") || DEFAULTS.fadeTime;
  dom.msgBgColorInput.value = params.get("msgBgColor") || DEFAULTS.msgBgColor;
  dom.msgBgOpacityInput.value = params.get("msgBgOpacity") || DEFAULTS.msgBgOpacity;

  const fontFromUrl = params.get("fontFamily");
  const initialFont = GOOGLE_FONTS.includes(fontFromUrl) ? fontFromUrl : DEFAULTS.fontFamily;
  dom.fontSelect.value = initialFont;
  setFont(initialFont);

  dom.settingsPanel.style.display = isEdit ? "block" : "none";
  dom.settingsToggle.style.display = isEdit ? "block" : "none";

  function applySettings() {
    document.documentElement.style.setProperty("--twitch-color", dom.twitchColorInput.value);
    document.documentElement.style.setProperty("--youtube-color", dom.youtubeColorInput.value);

    const rgb = hexToRgb(dom.msgBgColorInput.value);
    const alpha = Number.parseFloat(dom.msgBgOpacityInput.value);
    const rgbaColor = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
    document.documentElement.style.setProperty("--msg-bg-color", rgbaColor);

    const fadeTimeSec = safeNumber(dom.fadeTimeInput.value, safeNumber(DEFAULTS.fadeTime, 10));
    fadeTimeMs = fadeTimeSec * 1000;
    document.documentElement.style.setProperty("--fade-time", `${fadeTimeSec}s`);
  }

  const autoApplyInputs = [
    dom.twitchColorInput,
    dom.youtubeColorInput,
    dom.msgBgColorInput,
    dom.msgBgOpacityInput,
    dom.fadeTimeInput,
  ];
  autoApplyInputs.forEach((input) => {
    input.addEventListener("input", applySettings);
  });

  dom.fontSelect.addEventListener("change", () => {
    setFont(dom.fontSelect.value);
    applySettings();
  });

  dom.copyUrlBtn.addEventListener("click", () => {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const urlParams = new URLSearchParams({
      edit: "false",
      twitchColor: dom.twitchColorInput.value,
      youtubeColor: dom.youtubeColorInput.value,
      msgBgColor: dom.msgBgColorInput.value,
      msgBgOpacity: dom.msgBgOpacityInput.value,
      fadeTime: dom.fadeTimeInput.value,
      fontFamily: dom.fontSelect.value,
    });
    const finalUrl = `${baseUrl}?${urlParams.toString()}`;

    if (!navigator.clipboard) {
      alert("Clipboard API unavailable. Use HTTPS or localhost.");
      return;
    }

    navigator.clipboard
      .writeText(finalUrl)
      .then(() => alert(`URL copied to clipboard:\n${finalUrl}`))
      .catch(() => alert("Failed to copy URL"));
  });

  dom.settingsToggle.addEventListener("click", () => {
    const isOpen = dom.settingsPanel.classList.toggle("open");
    dom.settingsToggle.textContent = isOpen ? "Settings »" : "Settings «";
  });

  applySettings();

  return {
    isEdit,
    getFadeTimeMs: () => fadeTimeMs,
  };
}
