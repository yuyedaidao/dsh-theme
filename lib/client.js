// dsh-theme client 半：浏览器端 classic-script bundle。
// 由 dsh-client-modules 以 /plugins/dsh-theme/client.js 提供给浏览器，
// 经 window.__ModuleLoader__.load 注册工厂；exports 暴露 apply / inject。
//
// 持久化用 localStorage（当前 dsh 版本的 settings 白名单是硬编码的，第三方
// 插件无法通过 settings 命名空间向 Web 客户端读写，见 index.js 的说明）。
window.__ModuleLoader__.load({
  id: "dsh-theme",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");
    var runtimeClient = require("@deepseek-ai/dsh-client-runtime/client");
    var defineStore = runtimeClient.defineStore;

    var LOCALE_NAMESPACE = "settings.background";
    var STORAGE_KEY = "dsh-theme:image";
    var SETTINGS_KEY = "dsh-theme:settings";
    var BACKGROUND_TAG_ID = "dsh-theme/background.css";
    var ROW_TAG_ID = "dsh-theme/BackgroundRow.css";
    var LAYER_ID = "dsh-theme-layer";
    var MAX_DIM = 1920;
    var JPEG_QUALITY = 0.85;

    var CLARITY_MIN = -100;
    var CLARITY_MAX = 100;
    var VEIL_MIN = 0;
    var VEIL_MAX = 100;
    var DEFAULT_SETTINGS = { clarity: 0, veil: 65 };

    // ── 静态：设置行样式 ───────────────────────────────────────────────────
    var ROW_CSS = [
      ".bg-row{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:16px 0;display:flex}",
      ".bg-row-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}",
      ".bg-row-body{flex-wrap:wrap;align-items:center;gap:8px;display:flex}",
      ".bg-row-preview{width:56px;height:56px;object-fit:cover;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;flex:none}",
      ".bg-row-url{flex:1 1 200px;min-width:0;height:32px;box-sizing:border-box;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13)}",
      ".bg-row-url::placeholder{color:var(--dsw-alias-label-tertiary)}",
      ".bg-row-btn{height:32px;box-sizing:border-box;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);cursor:pointer;white-space:nowrap}",
      ".bg-row-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".bg-row-slider{width:100%;box-sizing:border-box;flex-direction:column;gap:4px;display:flex}",
      ".bg-row-slider-head{flex-direction:row;justify-content:space-between;align-items:center;gap:8px;display:flex}",
      ".bg-row-slider-label{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13);line-height:20px}",
      ".bg-row-slider-value{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);line-height:20px;font-variant-numeric:tabular-nums}",
      ".bg-row-range{width:100%;margin:0;accent-color:var(--dsw-static-neutral-bluish-400);display:block}"
    ].join("\n");
    if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="' + ROW_TAG_ID + '"]') === null) {
      var rowTag = document.createElement("style");
      rowTag.dataset.plugin = "dsh-theme";
      rowTag.dataset.pluginCss = ROW_TAG_ID;
      rowTag.textContent = ROW_CSS;
      document.head.appendChild(rowTag);
    }

    // ── localStorage 读写 ─────────────────────────────────────────────────
    function loadImage() {
      try {
        return window.localStorage.getItem(STORAGE_KEY) || "";
      } catch (e) {
        return "";
      }
    }
    function saveImage(value) {
      try {
        if (value) window.localStorage.setItem(STORAGE_KEY, value);
        else window.localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        try {
          console.warn("[dsh-theme] 保存背景失败（可能超出 localStorage 配额）", e);
        } catch (_) {}
      }
    }
    function clamp(value, min, max) {
      var n = typeof value === "number" ? value : Number(value);
      if (!isFinite(n)) return min;
      return Math.min(max, Math.max(min, n));
    }
    function loadSettings() {
      var settings = { clarity: DEFAULT_SETTINGS.clarity, veil: DEFAULT_SETTINGS.veil };
      try {
        var raw = window.localStorage.getItem(SETTINGS_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            if (typeof parsed.clarity === "number") settings.clarity = clamp(parsed.clarity, CLARITY_MIN, CLARITY_MAX);
            if (typeof parsed.veil === "number") settings.veil = clamp(parsed.veil, VEIL_MIN, VEIL_MAX);
          }
        }
      } catch (e) {
        /* 损坏/不可读时回退默认 */
      }
      return settings;
    }
    function saveSettings(settings) {
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch (e) {
        try {
          console.warn("[dsh-theme] 保存清晰度/遮罩设置失败", e);
        } catch (_) {}
      }
    }

    // ── 背景 CSS：独立层 + 半透明 veil（只透出底层画布，抬升/悬浮表面保持不透明）──
    function escapeCssUrl(url) {
      return String(url)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r/g, " ")
        .replace(/\n/g, " ");
    }

    // 清晰度 → CSS filter（作用于独立图片层，不影响 UI）。
    function clarityFilter(clarity) {
      if (!clarity || clarity === 0) return "none";
      if (clarity < 0) {
        var px = Math.round((-clarity / 100) * 10);
        return px <= 0 ? "none" : "blur(" + px + "px)";
      }
      var contrast = 1 + (clarity / 100) * 0.6;
      var saturate = 1 + (clarity / 100) * 0.2;
      return "contrast(" + contrast.toFixed(3) + ") saturate(" + saturate.toFixed(3) + ")";
    }

    // 遮罩不透明度（0–100，默认 65）→ 底层画布 + 侧边栏的 alpha。
    function veilAlpha(base, veil) {
      var k = veil / 65;
      return Math.min(1, base * k).toFixed(3);
    }

    function buildBackgroundCss(image, clarity, veil) {
      if (!image) return "";
      var url = escapeCssUrl(image);
      var filter = clarityFilter(clarity);
      return [
        "#" + LAYER_ID + "{",
        "  position:fixed;",
        "  inset:0;",
        "  z-index:-1;",
        "  pointer-events:none;",
        "  background-image:url(\"" + url + "\");",
        "  background-size:cover;",
        "  background-position:center;",
        "  background-repeat:no-repeat;",
        "  filter:" + filter + ";",
        "}",
        "body{",
        "  background:transparent;",
        "  --dsw-alias-bg-base: rgba(255,255,255," + veilAlpha(0.65, veil) + ");",
        "  --dsw-specific-sidebar-fill: rgba(249,250,251," + veilAlpha(0.65, veil) + ");",
        "}",
        "body[data-ds-dark-theme]{",
        "  --dsw-alias-bg-base: rgba(21,21,23," + veilAlpha(0.65, veil) + ");",
        "  --dsw-specific-sidebar-fill: rgba(27,27,28," + veilAlpha(0.65, veil) + ");",
        "}"
      ].join("\n");
    }

    // ── 图片压缩：超大图缩放到 MAX_DIM，输出 JPEG，避免 localStorage 膨胀 ──
    function compressImage(file, done) {
      var objectUrl;
      try {
        objectUrl = URL.createObjectURL(file);
      } catch (e) {
        done("");
        return;
      }
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        var scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        if (scale >= 1) {
          readAsDataUrl(file, done);
          return;
        }
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx2d = canvas.getContext("2d");
        ctx2d.drawImage(img, 0, 0, w, h);
        try {
          done(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
        } catch (e) {
          readAsDataUrl(file, done);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        done("");
      };
      img.src = objectUrl;
    }
    function readAsDataUrl(file, done) {
      var reader = new FileReader();
      reader.onload = function () { done(String(reader.result)); };
      reader.onerror = function () { done(""); };
      reader.readAsDataURL(file);
    }

    // ── 词典 ──────────────────────────────────────────────────────────────
    var zh = {
      "title": "背景图片",
      "urlPlaceholder": "粘贴图片地址，如 https://…",
      "urlLabel": "图片 URL",
      "choose": "选择图片",
      "remove": "移除",
      "preview": "背景预览",
      "clarity": "清晰度",
      "clarityHint": "正值更清晰，负值更柔和",
      "veil": "遮罩不透明度",
      "veilHint": "数值越小，图片透出越清楚"
    };
    var en = {
      "title": "Background image",
      "urlPlaceholder": "Paste an image URL, e.g. https://…",
      "urlLabel": "Image URL",
      "choose": "Choose image",
      "remove": "Remove",
      "preview": "Preview",
      "clarity": "Clarity",
      "clarityHint": "Positive sharpens, negative softens",
      "veil": "Veil opacity",
      "veilHint": "Lower makes the image show through more"
    };

    // ── 设置行组件 ────────────────────────────────────────────────────────
    function BackgroundRow(props) {
      var t = props.t;
      var useStore = props.useStore;
      var setImage = props.setImage;
      var setClarity = props.setClarity;
      var setVeil = props.setVeil;
      var image = useStore(function (s) { return s.image; });
      var clarity = useStore(function (s) { return s.clarity; });
      var veil = useStore(function (s) { return s.veil; });

      var useState = React.useState;
      var useEffect = React.useEffect;
      var useRef = React.useRef;
      var createElement = React.createElement;

      var urlState = useState(image && image.indexOf("data:") !== 0 ? image : "");
      var urlText = urlState[0];
      var setUrlText = urlState[1];
      var fileRef = useRef(null);

      useEffect(function () {
        setUrlText(image && image.indexOf("data:") !== 0 ? image : "");
      }, [image]);

      function onChooseClick() {
        if (fileRef.current) fileRef.current.click();
      }
      function onFileChange(ev) {
        var file = ev.target.files && ev.target.files[0];
        if (file) {
          compressImage(file, function (dataUrl) {
            if (dataUrl) setImage(dataUrl);
          });
        }
        ev.target.value = "";
      }
      function commitUrl() {
        setImage(urlText.trim());
      }
      function onUrlKeyDown(ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          commitUrl();
        }
      }
      function onRemove() {
        setUrlText("");
        setImage("");
      }

      function renderSlider(id, label, hint, value, min, max, step, onChange) {
        return createElement("div", { className: "bg-row-slider", key: id },
          createElement("div", { className: "bg-row-slider-head" },
            createElement("div", null,
              createElement("div", { className: "bg-row-slider-label" }, label),
              createElement("div", { className: "bg-row-slider-value" }, hint)
            ),
            createElement("span", { className: "bg-row-slider-value" }, String(value))
          ),
          createElement("input", {
            className: "bg-row-range",
            type: "range",
            min: min,
            max: max,
            step: step,
            value: value,
            "aria-label": label,
            onChange: function (ev) { onChange(Number(ev.target.value)); }
          })
        );
      }

      var sliders = image
        ? [
            renderSlider("clarity", t("clarity"), t("clarityHint"), clarity, CLARITY_MIN, CLARITY_MAX, 1, setClarity),
            renderSlider("veil", t("veil"), t("veilHint"), veil, VEIL_MIN, VEIL_MAX, 1, setVeil)
          ]
        : null;

      return createElement("div", { className: "bg-row" },
        createElement("div", { className: "bg-row-title" }, t("title")),
        createElement("div", { className: "bg-row-body" },
          image ? createElement("img", {
            className: "bg-row-preview",
            src: image,
            alt: t("preview")
          }) : null,
          createElement("input", {
            className: "bg-row-url",
            type: "text",
            value: urlText,
            placeholder: t("urlPlaceholder"),
            "aria-label": t("urlLabel"),
            onChange: function (ev) { setUrlText(ev.target.value); },
            onBlur: commitUrl,
            onKeyDown: onUrlKeyDown
          }),
          createElement("button", { type: "button", className: "bg-row-btn", onClick: onChooseClick }, t("choose")),
          image ? createElement("button", { type: "button", className: "bg-row-btn", onClick: onRemove }, t("remove")) : null
        ),
        sliders,
        createElement("input", {
          type: "file",
          accept: "image/*",
          ref: fileRef,
          style: { display: "none" },
          onChange: onFileChange
        })
      );
    }

    var inject = ["slots", "locale"];

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(LOCALE_NAMESPACE, { zh: zh, en: en });
      }, "dsh-theme: locale");

      var store = defineStore({
        init: function () {
          var settings = loadSettings();
          return { image: loadImage(), clarity: settings.clarity, veil: settings.veil };
        },
        actions: {
          sync: function (d, image) { d.image = image; },
          setClarity: function (d, clarity) { d.clarity = clarity; },
          setVeil: function (d, veil) { d.veil = veil; }
        }
      });

      var bound = null;
      var cssTag = null;
      var layerEl = null;

      function ensureLayer() {
        if (!layerEl) {
          layerEl = document.createElement("div");
          layerEl.id = LAYER_ID;
          layerEl.dataset.plugin = "dsh-theme";
          document.body.appendChild(layerEl);
        }
        return layerEl;
      }
      function removeLayer() {
        if (layerEl && layerEl.parentNode) layerEl.parentNode.removeChild(layerEl);
        layerEl = null;
      }

      function applyVisual() {
        var image = loadImage();
        var settings = loadSettings();
        var css = buildBackgroundCss(image, settings.clarity, settings.veil);
        if (!cssTag) {
          cssTag = document.createElement("style");
          cssTag.dataset.plugin = "dsh-theme";
          cssTag.dataset.pluginCss = BACKGROUND_TAG_ID;
          document.head.appendChild(cssTag);
        }
        cssTag.textContent = css;

        if (image) {
          if (document.body) ensureLayer();
          else if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", applyVisual, { once: true });
          }
        } else {
          removeLayer();
        }
      }

      function setImage(value) {
        saveImage(value);
        if (bound) bound.sync(value);
        applyVisual();
      }
      function setClarity(value) {
        var settings = loadSettings();
        settings.clarity = clamp(value, CLARITY_MIN, CLARITY_MAX);
        saveSettings(settings);
        if (bound) bound.setClarity(settings.clarity);
        applyVisual();
      }
      function setVeil(value) {
        var settings = loadSettings();
        settings.veil = clamp(value, VEIL_MIN, VEIL_MAX);
        saveSettings(settings);
        if (bound) bound.setVeil(settings.veil);
        applyVisual();
      }

      applyVisual();
      ctx.effect(function () {
        return function () {
          if (cssTag && cssTag.parentNode) cssTag.parentNode.removeChild(cssTag);
          cssTag = null;
          removeLayer();
        };
      }, "dsh-theme: background css");

      var injected = function (actions) {
        bound = actions;
        bound.sync(loadImage());
        return { setImage: setImage, setClarity: setClarity, setVeil: setVeil };
      };

      ctx.slots.inject("settings.general.item", function () {
        return ctx.slots.register({
          name: "settings.general.item",
          id: "background-image",
          order: 11,
          store: store,
          locale: LOCALE_NAMESPACE,
          inject: injected
        }, BackgroundRow);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
