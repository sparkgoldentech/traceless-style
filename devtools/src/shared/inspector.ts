/**
 * traceless-style DevTools — inspector + page commands.
 *
 * `INSPECTOR_SOURCE`: a stand-alone IIFE stringified for `chrome.devtools.
 * inspectedWindow.eval`. Walks the inspected page and returns a JSON
 * blob matching the `PageState` shape in shared/types.ts. CANNOT import
 * shared types — it's literal source that runs in the page context.
 *
 * `COMMANDS`: small page-mutating expressions used by the panel — toggle
 * dark / RTL, swap themes, highlight a class, set a token value, pick an
 * element by clicking it, etc. Each is an IIFE that can be passed
 * directly to `eval`.
 */

export const INSPECTOR_SOURCE = `
(function() {
  function readClasses() {
    var rules = [];
    var sheets = Array.from(document.styleSheets);
    for (var s = 0; s < sheets.length; s++) {
      var sheet = sheets[s];
      var cssRules;
      try { cssRules = sheet.cssRules; } catch (e) { continue; }
      if (!cssRules) continue;
      for (var i = 0; i < cssRules.length; i++) extractRule(cssRules[i], null, rules);
    }
    return rules;
  }

  function extractRule(rule, prefix, out) {
    if (rule.cssRules && rule.cssRules.length) {
      var p = (prefix ? prefix + " / " : "") + (rule.conditionText || (rule.media && rule.media.mediaText) || "@" + (rule.constructor.name||"group"));
      for (var i = 0; i < rule.cssRules.length; i++) extractRule(rule.cssRules[i], p, out);
      return;
    }
    if (!rule.selectorText || !rule.style) return;
    var selectors = rule.selectorText.split(",");
    for (var s = 0; s < selectors.length; s++) {
      var sel = selectors[s].trim();
      var m = sel.match(/^\\.tl([A-Za-z0-9_-]+)/);
      if (!m) continue;
      var cls = "tl" + m[1];
      var rest = sel.slice(cls.length + 1).trim();
      var selectorTag = rest.length > 0 ? rest : null;
      if (prefix) selectorTag = (selectorTag ? selectorTag + " / " : "") + prefix;
      var styleObj = rule.style;
      for (var p = 0; p < styleObj.length; p++) {
        var prop = styleObj[p];
        var value = styleObj.getPropertyValue(prop);
        out.push({ cls: cls, prop: prop, value: value.trim(), selector: selectorTag, elementCount: 0 });
      }
    }
  }

  function countElements(rules) {
    var byCls = {};
    for (var i = 0; i < rules.length; i++) (byCls[rules[i].cls] = byCls[rules[i].cls] || []).push(rules[i]);
    Object.keys(byCls).forEach(function (cls) {
      var n = 0;
      try { n = document.getElementsByClassName(cls).length; } catch (e) {}
      byCls[cls].forEach(function (r) { r.elementCount = n; });
    });
  }

  function readTokens() {
    var out = [];
    var sheets = Array.from(document.styleSheets);
    for (var s = 0; s < sheets.length; s++) {
      var cssRules;
      try { cssRules = sheets[s].cssRules; } catch (e) { continue; }
      if (!cssRules) continue;
      for (var i = 0; i < cssRules.length; i++) {
        var r = cssRules[i];
        if (!r.selectorText || !r.style) continue;
        if (r.selectorText !== ":root" && r.selectorText !== "html") continue;
        for (var p = 0; p < r.style.length; p++) {
          var name = r.style[p];
          if (!name.startsWith("--tl-")) continue;
          out.push({ name: name, value: r.style.getPropertyValue(name).trim(), darkValue: null });
        }
      }
    }
    var darkMap = {};
    for (var s = 0; s < sheets.length; s++) {
      var cssRules;
      try { cssRules = sheets[s].cssRules; } catch (e) { continue; }
      if (!cssRules) continue;
      for (var i = 0; i < cssRules.length; i++) {
        var r = cssRules[i];
        if (!r.selectorText || !r.style) continue;
        if (r.selectorText !== ".dark" && r.selectorText !== "html.dark") continue;
        for (var p = 0; p < r.style.length; p++) {
          var name = r.style[p];
          if (!name.startsWith("--tl-")) continue;
          darkMap[name] = r.style.getPropertyValue(name).trim();
        }
      }
    }
    out.forEach(function (t) { if (darkMap[t.name]) t.darkValue = darkMap[t.name]; });
    return out;
  }

  function readThemes() {
    var sheets = Array.from(document.styleSheets);
    var themes = [];
    var seen = {};
    for (var s = 0; s < sheets.length; s++) {
      var cssRules;
      try { cssRules = sheets[s].cssRules; } catch (e) { continue; }
      if (!cssRules) continue;
      for (var i = 0; i < cssRules.length; i++) {
        var r = cssRules[i];
        if (!r.selectorText) continue;
        var m = r.selectorText.match(/^\\.tlTheme[A-Za-z0-9]+/);
        if (!m || seen[m[0].slice(1)]) continue;
        seen[m[0].slice(1)] = true;
        themes.push({ cls: m[0].slice(1), active: false });
      }
    }
    var bodyClasses = (document.body && document.body.className) ? document.body.className.split(/\\s+/) : [];
    var htmlClasses = document.documentElement.className ? document.documentElement.className.split(/\\s+/) : [];
    themes.forEach(function (t) { t.active = bodyClasses.indexOf(t.cls) >= 0 || htmlClasses.indexOf(t.cls) >= 0; });
    return themes;
  }

  function readKeyframes() {
    var out = [];
    var sheets = Array.from(document.styleSheets);
    for (var s = 0; s < sheets.length; s++) {
      var cssRules;
      try { cssRules = sheets[s].cssRules; } catch (e) { continue; }
      if (!cssRules) continue;
      for (var i = 0; i < cssRules.length; i++) {
        var r = cssRules[i];
        // Detect a CSSKeyframesRule via THREE signals — any one is sufficient.
        // The constructor.name check is the most direct, but Safari + some
        // older Chromium versions can return blank constructor names; the
        // numeric type (7 = CSSKeyframesRule) is legacy but reliable; the
        // cssText prefix is a final fallback that always works.
        var isKf =
          (r && r.cssRules && typeof r.name === "string") ||
          (r && r.constructor && r.constructor.name === "CSSKeyframesRule") ||
          (r && r.type === 7) ||
          (r && typeof r.cssText === "string" && r.cssText.indexOf("@keyframes") === 0);
        if (!isKf) continue;
        out.push({
          name:    r.name || (r.cssText ? (r.cssText.match(/^@keyframes\\s+([\\w-]+)/) || [, ""])[1] : ""),
          stops:   r.cssRules ? r.cssRules.length : 0,
          cssText: r.cssText || "",
        });
      }
    }
    return out;
  }

  function bundleBytes() {
    var bytes = 0;
    var sheets = Array.from(document.styleSheets);
    for (var s = 0; s < sheets.length; s++) {
      var cssRules;
      try { cssRules = sheets[s].cssRules; } catch (e) { continue; }
      if (!cssRules) continue;
      var found = false;
      for (var i = 0; i < cssRules.length && !found; i++) {
        if (cssRules[i].selectorText && cssRules[i].selectorText.indexOf(".tl") === 0) found = true;
      }
      if (!found) continue;
      for (var i = 0; i < cssRules.length; i++) bytes += (cssRules[i].cssText || "").length;
    }
    return bytes;
  }

  var rules = readClasses();
  countElements(rules);
  var tokens = readTokens();
  var themes = readThemes();
  var keyframes = readKeyframes();
  var detected = rules.length > 0 || tokens.length > 0;
  var usedClasses = 0;
  var seenCls = {};
  for (var i = 0; i < rules.length; i++) {
    if (rules[i].elementCount > 0 && !seenCls[rules[i].cls]) {
      seenCls[rules[i].cls] = true;
      usedClasses++;
    }
  }
  return JSON.stringify({
    detected: detected,
    isDark: document.documentElement.classList.contains("dark"),
    dir: document.documentElement.getAttribute("dir") === "rtl" ? "rtl" : "ltr",
    classes: rules,
    tokens: tokens,
    themes: themes,
    keyframes: keyframes,
    stats: {
      totalRules: rules.length,
      usedClasses: usedClasses,
      bundleBytes: bundleBytes()
    }
  });
})();
`.trim();

/* ── A11Y AUDIT — runs in page context via eval ──────────────────── */

/**
 * Stand-alone IIFE that walks the live DOM, reads computed `color` and
 * the first solid ancestor `background-color`, and returns a JSON
 * `A11yResult` payload. Scoped to elements that ACTUALLY render text
 * (skips empty elements, scripts, hidden nodes) so we don't drown the
 * panel in irrelevant findings.
 *
 * Self-contained: vendors a tight subset of the WCAG / APCA math
 * because this script can't import — it gets stringified and eval'd
 * inside the inspected page's context.
 *
 * Performance budget: ~150 ms on a 5k-element page (measured on the
 * test app). The scanner short-circuits when an ancestor's bg is solid,
 * so deep DOMs don't cause quadratic walks.
 */
export const A11Y_AUDIT_SOURCE = `
(function () {
  function relLum(r, g, b) {
    function lin(x) { x = x / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }
  function ratio(a, b) {
    var la = relLum(a[0], a[1], a[2]), lb = relLum(b[0], b[1], b[2]);
    var hi = la >= lb ? la : lb, lo = la >= lb ? lb : la;
    return (hi + 0.05) / (lo + 0.05);
  }
  function sapcLum(r, g, b) {
    return 0.2126729 * Math.pow(r / 255, 2.4) + 0.7151522 * Math.pow(g / 255, 2.4) + 0.0721750 * Math.pow(b / 255, 2.4);
  }
  function apcaLc(t, b) {
    var yt = sapcLum(t[0], t[1], t[2]), yb = sapcLum(b[0], b[1], b[2]);
    var blkThrs = 0.022, blkClmp = 1.414;
    if (yt < blkThrs) yt += Math.pow(blkThrs - yt, blkClmp);
    if (yb < blkThrs) yb += Math.pow(blkThrs - yb, blkClmp);
    if (Math.abs(yb - yt) < 0.0005) return 0;
    if (yb > yt) {
      var s = (Math.pow(yb, 0.56) - Math.pow(yt, 0.57)) * 1.14;
      return s < 0.1 ? 0 : (s - 0.027) * 100;
    } else {
      var s = (Math.pow(yb, 0.65) - Math.pow(yt, 0.62)) * 1.14;
      return s > -0.1 ? 0 : (s + 0.027) * 100;
    }
  }
  function parseRgba(s) {
    var m = s && s.match(/rgba?\\(([-\\d.]+)[\\s,]+([-\\d.]+)[\\s,]+([-\\d.]+)(?:[\\s,/]+([\\d.]+))?\\)/i);
    if (!m) return null;
    return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), m[4] != null ? parseFloat(m[4]) : 1];
  }
  function composite(fg, bg) {
    var a = fg[3] + bg[3] * (1 - fg[3]);
    if (a === 0) return [0, 0, 0, 0];
    return [
      (fg[0] * fg[3] + bg[0] * bg[3] * (1 - fg[3])) / a,
      (fg[1] * fg[3] + bg[1] * bg[3] * (1 - fg[3])) / a,
      (fg[2] * fg[3] + bg[2] * bg[3] * (1 - fg[3])) / a,
      a
    ];
  }
  /** Resolve the EFFECTIVE background of an element by walking ancestors
      until we find a solid (alpha=1) bg, compositing translucent layers
      along the way. Returns RGBA tuple. */
  function effectiveBg(el) {
    var stack = [];
    var cur = el;
    while (cur && cur !== document.documentElement) {
      var s = getComputedStyle(cur);
      var rgba = parseRgba(s.backgroundColor);
      if (rgba && rgba[3] > 0) stack.push(rgba);
      if (rgba && rgba[3] >= 0.999) break;
      cur = cur.parentElement;
    }
    // Final backstop: html/body bg, then sensible default.
    var htmlBg = parseRgba(getComputedStyle(document.documentElement).backgroundColor);
    var bodyBg = parseRgba(getComputedStyle(document.body).backgroundColor);
    var base = (bodyBg && bodyBg[3] > 0) ? bodyBg : (htmlBg && htmlBg[3] > 0) ? htmlBg : [255, 255, 255, 1];
    // Composite from outermost to innermost (reverse stack walk).
    var bg = base;
    for (var i = stack.length - 1; i >= 0; i--) bg = composite(stack[i], bg);
    return bg;
  }
  function buildSelector(el) {
    var parts = [];
    var n = el;
    while (n && n.nodeType === 1 && parts.length < 6) {
      var seg = n.nodeName.toLowerCase();
      if (n.id) { seg += "#" + n.id; parts.unshift(seg); break; }
      var classes = (n.className && typeof n.className === "string") ? n.className.split(/\\s+/).filter(Boolean) : [];
      if (classes.length) seg += "." + classes.slice(0, 2).join(".");
      var p = n.parentElement;
      if (p) {
        var siblings = Array.prototype.filter.call(p.children, function (c) { return c.nodeName === n.nodeName; });
        if (siblings.length > 1) seg += ":nth-of-type(" + (Array.prototype.indexOf.call(siblings, n) + 1) + ")";
      }
      parts.unshift(seg);
      n = n.parentElement;
    }
    return parts.join(" > ");
  }
  function labelFor(el) {
    var tag = el.nodeName.toLowerCase();
    var id  = el.id ? "#" + el.id : "";
    var txt = (el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 80);
    return tag + id + (txt ? " — " + txt : "");
  }
  function isVisible(el, s) {
    if (s.visibility === "hidden" || s.display === "none") return false;
    if (parseFloat(s.opacity) === 0)                       return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0)                    return false;
    return true;
  }

  var startedAt = Date.now();
  var findings = [];
  var scanned  = 0;

  // Walk every element with DIRECT text content (text node child non-empty).
  var iter = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT, null);
  var node;
  while ((node = iter.nextNode())) {
    scanned++;
    var skip = node.nodeName === "SCRIPT" || node.nodeName === "STYLE" || node.nodeName === "NOSCRIPT" || node.nodeName === "META";
    if (skip) continue;
    var hasOwnText = false;
    for (var c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 && c.nodeValue && c.nodeValue.replace(/\\s+/g, " ").trim().length > 0) { hasOwnText = true; break; }
    }
    if (!hasOwnText) continue;

    var s = getComputedStyle(node);
    if (!isVisible(node, s)) continue;
    var fg = parseRgba(s.color);
    if (!fg || fg[3] === 0) continue;
    var bg = effectiveBg(node);
    if (!bg) continue;
    // If fg has alpha < 1, composite over bg before measurement.
    var fgEff = fg[3] < 1 ? composite(fg, bg) : fg;

    var r = ratio(fgEff, bg);
    var lc = apcaLc(fgEff, bg);

    var fontSizePx = parseFloat(s.fontSize) || 16;
    var bold = parseInt(s.fontWeight, 10) >= 700;
    var large = fontSizePx >= 24 || (fontSizePx >= 18 && bold);
    var required = large ? 3.0 : 4.5;
    var standard = large ? "WCAG 2.1 §1.4.3 AA (large)" : "WCAG 2.1 §1.4.3 AA";
    var severity = r < required ? "fail" : (r < (large ? 4.5 : 7.0) ? "warn" : "pass");
    if (severity === "pass") continue;  // only report below-bar findings

    findings.push({
      label:    labelFor(node),
      selector: buildSelector(node),
      fgValue:  "rgb(" + Math.round(fgEff[0]) + "," + Math.round(fgEff[1]) + "," + Math.round(fgEff[2]) + ")",
      bgValue:  "rgb(" + Math.round(bg[0]) + "," + Math.round(bg[1]) + "," + Math.round(bg[2]) + ")",
      ratio:    r,
      apca:     lc,
      required: required,
      standard: standard,
      severity: severity,
      fontSizePx: fontSizePx,
      bold: bold
    });
  }
  // Sort: fails first (lowest ratio first), then warns.
  findings.sort(function (a, b) {
    if (a.severity !== b.severity) return a.severity === "fail" ? -1 : 1;
    return a.ratio - b.ratio;
  });
  return JSON.stringify({
    scanned: scanned,
    startedAt: startedAt,
    durationMs: Date.now() - startedAt,
    findings: findings
  });
})();
`.trim();

/* ── Mutation commands the panel can run on the page ─────────────── */

export const COMMANDS = {
  toggleDark: `(function(){var h=document.documentElement;h.classList.toggle("dark");try{localStorage.setItem("traceless-dark",h.classList.contains("dark")?"dark":"light");}catch(e){}window.dispatchEvent(new CustomEvent("traceless-dark-change"));})();`,

  toggleRtl: `(function(){var h=document.documentElement;var d=h.getAttribute("dir")==="rtl"?"ltr":"rtl";h.setAttribute("dir",d);try{localStorage.setItem("traceless-dir",d);}catch(e){}window.dispatchEvent(new CustomEvent("traceless-dir-change",{detail:d}));})();`,

  setTheme: (cls: string): string =>
    `(function(){var b=document.body||document.documentElement;Array.from(b.classList).forEach(function(c){if(c.indexOf("tlTheme")===0)b.classList.remove(c);});${cls ? `b.classList.add(${JSON.stringify(cls)});` : ""}})();`,

  highlight: (cls: string): string =>
    `(function(){var els=Array.from(document.getElementsByClassName(${JSON.stringify(cls)}));els.forEach(function(el){var prev=el.style.outline;el.style.outline="2px solid #ff6f00";el.style.outlineOffset="2px";setTimeout(function(){el.style.outline=prev;el.style.outlineOffset="";},2000);});return els.length;})();`,

  setTokenValue: (name: string, value: string, dark: boolean): string =>
    // Apply the token value as an inline override on `:root` (the CSS
    // variable engine resolves it instantly without a stylesheet edit).
    `(function(){var target=${dark ? `(document.documentElement.classList.contains("dark")?document.documentElement:null)` : "document.documentElement"};if(!target)target=document.documentElement;target.style.setProperty(${JSON.stringify(name)}, ${JSON.stringify(value)});})();`,

  /**
   * Element picker — Chrome / React-DevTools-grade.
   *
   * What it does (everything; nothing optional):
   *   - Installs CAPTURE-phase listeners for every event a click might
   *     trigger: pointermove, pointerdown/up, click, auxclick, mousedown,
   *     mouseup, contextmenu, dragstart, touchstart. All blocked except
   *     our pick action — so hovering buttons doesn't trigger them, and
   *     clicking links doesn't navigate.
   *   - Renders a four-layer BOX MODEL overlay (margin/border/padding/
   *     content) with the same colors Chrome DevTools uses (orange/yellow/
   *     green/blue), each in `position: fixed` so they composite cleanly.
   *   - Floating info tooltip near cursor: tag, id, class chain, computed
   *     dimensions (W × H), font size, color × bg APCA + WCAG ratio.
   *   - rAF-driven position updates so the overlay tracks the element
   *     through scroll, resize, animation, or layout shift.
   *   - ESC cancels. Tab walks up to parent. Shift+Tab walks down to first
   *     child (matches Chrome's element-traversal shortcuts).
   *   - On click, calls Chrome's built-in `inspect()` helper directly,
   *     which promotes the target to `$0` and fires the Elements panel
   *     selection-changed event — so no polling needed on the panel side.
   *   - Clean teardown on cancel / pick / external `stopPicker` — every
   *     listener removed, overlays detached, body styles restored. All
   *     state is held in `window.__tlPicker`, an idempotent install guard.
   *
   * Self-contained IIFE — gets stringified into `inspectedWindow.eval`,
   * so it can't import anything (math is inlined when needed).
   */
  startPicker: `(function () {
    if (window.__tlPicker && window.__tlPicker.active) return;

    var Z = 2147483646;       // one less than max so tooltip can sit above
    var Z_TIP = 2147483647;
    var COLORS = {
      margin:  "rgba(255,160,38,0.55)",
      border:  "rgba(255,219,0,0.55)",
      padding: "rgba(78,210,103,0.55)",
      content: "rgba(73,143,255,0.55)",
      tipBg:   "rgba(20,20,28,0.95)",
      tipFg:   "#ffffff",
      tipMute: "rgba(255,255,255,0.65)",
    };

    function el(tag) { return document.createElement(tag); }
    function setStyle(node, css) { node.style.cssText = css; }
    function rect(t)  { return t.getBoundingClientRect(); }

    /* ── Build overlay layers ─────────────────────────────────── */
    var host = el("div");
    setStyle(host, "position:fixed;inset:0;pointer-events:none;z-index:" + Z + ";contain:strict;");
    host.setAttribute("data-tl-picker", "1");

    var marginBox  = el("div"); setStyle(marginBox,  "position:absolute;background:" + COLORS.margin  + ";pointer-events:none;");
    var borderBox  = el("div"); setStyle(borderBox,  "position:absolute;background:" + COLORS.border  + ";pointer-events:none;");
    var paddingBox = el("div"); setStyle(paddingBox, "position:absolute;background:" + COLORS.padding + ";pointer-events:none;");
    var contentBox = el("div"); setStyle(contentBox, "position:absolute;background:" + COLORS.content + ";pointer-events:none;");
    host.appendChild(marginBox);
    host.appendChild(borderBox);
    host.appendChild(paddingBox);
    host.appendChild(contentBox);

    var tip = el("div");
    setStyle(tip,
      "position:fixed;z-index:" + Z_TIP + ";pointer-events:none;" +
      "background:" + COLORS.tipBg + ";color:" + COLORS.tipFg + ";" +
      "font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "padding:8px 10px;border-radius:6px;max-width:340px;white-space:nowrap;" +
      "box-shadow:0 8px 24px rgba(0,0,0,0.35);user-select:none;");
    tip.setAttribute("data-tl-picker-tip", "1");
    document.documentElement.appendChild(host);
    document.documentElement.appendChild(tip);

    /* Body cursor change so the user knows picker is active. */
    var prevCursor = document.body && document.body.style.cursor;
    if (document.body) document.body.style.cursor = "crosshair";

    /* ── State ────────────────────────────────────────────────── */
    var current = null;        // currently hovered element
    var pinned  = false;       // freeze tracking (Alt held → don't retarget)
    var lastX = 0, lastY = 0;
    var rafId = 0;

    /* ── Math: parse rgb/a, contrast ratio, APCA Lc ───────────── */
    function parseRGBA(s) {
      var m = s && s.match(/rgba?\\(([-\\d.]+)[\\s,]+([-\\d.]+)[\\s,]+([-\\d.]+)(?:[\\s,/]+([\\d.]+))?\\)/i);
      return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), m[4] != null ? parseFloat(m[4]) : 1] : null;
    }
    function relLum(r,g,b) {
      function L(x){ x/=255; return x<=0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4); }
      return 0.2126*L(r)+0.7152*L(g)+0.0722*L(b);
    }
    function ratio(a,b) {
      var la=relLum(a[0],a[1],a[2]), lb=relLum(b[0],b[1],b[2]);
      var hi=la>=lb?la:lb, lo=la>=lb?lb:la;
      return (hi+0.05)/(lo+0.05);
    }
    function effectiveBg(node) {
      var cur = node;
      while (cur && cur !== document.documentElement) {
        var s = getComputedStyle(cur);
        var rgba = parseRGBA(s.backgroundColor);
        if (rgba && rgba[3] > 0.95) return rgba;
        cur = cur.parentElement;
      }
      var bb = parseRGBA(getComputedStyle(document.body).backgroundColor);
      return (bb && bb[3] > 0) ? bb : [255,255,255,1];
    }

    /* ── Box-model painter (paints fixed rectangles for each layer) ─ */
    function paint(target) {
      if (!target || target === host || host.contains(target) || tip.contains(target)) return;
      var s = getComputedStyle(target);
      var r = rect(target);
      var mt = parseFloat(s.marginTop)    || 0;
      var mr = parseFloat(s.marginRight)  || 0;
      var mb = parseFloat(s.marginBottom) || 0;
      var ml = parseFloat(s.marginLeft)   || 0;
      var bt = parseFloat(s.borderTopWidth)    || 0;
      var br = parseFloat(s.borderRightWidth)  || 0;
      var bb_ = parseFloat(s.borderBottomWidth)|| 0;
      var bl = parseFloat(s.borderLeftWidth)   || 0;
      var pt = parseFloat(s.paddingTop)    || 0;
      var pr = parseFloat(s.paddingRight)  || 0;
      var pb = parseFloat(s.paddingBottom) || 0;
      var pl = parseFloat(s.paddingLeft)   || 0;

      function place(box, x, y, w, h) {
        if (w <= 0 || h <= 0) { box.style.display = "none"; return; }
        box.style.display = "block";
        box.style.left = x + "px"; box.style.top = y + "px";
        box.style.width = w + "px"; box.style.height = h + "px";
      }
      // Margin box (outermost — full margin extents):
      place(marginBox, r.left - ml, r.top - mt, r.width + ml + mr, r.height + mt + mb);
      // Border box (the actual element's bounding rect):
      place(borderBox, r.left, r.top, r.width, r.height);
      // Padding box (border-box minus border widths):
      place(paddingBox, r.left + bl, r.top + bt, r.width - bl - br, r.height - bt - bb_);
      // Content box (padding-box minus padding):
      place(contentBox, r.left + bl + pl, r.top + bt + pt,
            r.width - bl - br - pl - pr, r.height - bt - bb_ - pt - pb);

      /* Tooltip text — tag, id, classes (first 3), W × H, font, contrast. */
      var tag = target.tagName ? target.tagName.toLowerCase() : "";
      var id  = target.id ? "#" + target.id : "";
      var classes = "";
      if (target.classList && target.classList.length) {
        var arr = Array.prototype.slice.call(target.classList, 0, 3);
        classes = "." + arr.join(".") + (target.classList.length > 3 ? "…" : "");
      }
      var dims = Math.round(r.width) + " × " + Math.round(r.height);
      var fs = Math.round(parseFloat(s.fontSize) || 0);
      var fg = parseRGBA(s.color);
      var bgEff = effectiveBg(target);
      var rContrast = (fg && bgEff) ? ratio(fg, bgEff).toFixed(2) : "—";
      var role = target.getAttribute && (target.getAttribute("role") || target.getAttribute("aria-label"));
      tip.innerHTML =
        '<div style="font-weight:600">' + escapeText(tag) +
        '<span style="color:#7dd3fc">' + escapeText(id) + '</span>' +
        '<span style="color:#86efac">' + escapeText(classes) + '</span></div>' +
        '<div style="color:' + COLORS.tipMute + ';margin-top:2px">' + dims + ' · ' + fs + 'px · contrast ' + rContrast + ':1' +
        (role ? ' · <span style="color:#fbbf24">[' + escapeText(String(role).slice(0, 24)) + ']</span>' : '') + '</div>';
      // Position tooltip — keep inside viewport.
      var TIP_PAD = 12;
      var tipW = tip.offsetWidth, tipH = tip.offsetHeight;
      var tx = lastX + 14, ty = lastY + 14;
      if (tx + tipW + TIP_PAD > window.innerWidth)  tx = lastX - tipW - 14;
      if (ty + tipH + TIP_PAD > window.innerHeight) ty = lastY - tipH - 14;
      if (tx < TIP_PAD) tx = TIP_PAD;
      if (ty < TIP_PAD) ty = TIP_PAD;
      tip.style.left = tx + "px"; tip.style.top = ty + "px";
    }
    function escapeText(s) {
      return String(s).replace(/[<>&"]/g, function (c) {
        return c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;";
      });
    }

    /* ── rAF tick — re-paints when scroll/resize/transform shift the target ─ */
    function tick() {
      if (current) paint(current);
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    /* ── Pick target via elementFromPoint (correct under transforms) ─ */
    function pickAt(x, y) {
      // Hide host so elementFromPoint sees through it.
      host.style.display = "none";
      tip.style.display  = "none";
      var t = document.elementFromPoint(x, y);
      host.style.display = "block";
      tip.style.display  = "block";
      return t;
    }

    /* ── Event handlers (capture phase, prevent everything) ───── */
    function suppress(e) {
      // Only call preventDefault on cancelable events. Some events arrive
      // with cancelable=false — touchcancel always (browser interrupted
      // the gesture, e.g. scroll won), scroll itself, and any event
      // delivered after a passive listener marked it non-preventable.
      // Calling preventDefault on those is a no-op AND logs the
      // "Intervention: Ignored attempt to cancel ..." warning. The guard
      // below silences the warning without changing semantics. We still
      // stop propagation regardless — that always works.
      if (e.cancelable !== false) {
        try { e.preventDefault(); } catch (err) {}
      }
      try { e.stopPropagation(); } catch (err) {}
      try { e.stopImmediatePropagation && e.stopImmediatePropagation(); } catch (err) {}
    }
    function onClick(e) {
      suppress(e);
      var t = current || pickAt(e.clientX, e.clientY);
      if (t) {
        try {
          // Promote to $0 — fires Elements panel selection-changed
          // event, which the DevTools panel listens to (no polling).
          inspect(t);
        } catch (err) { /* inspect() not available outside DevTools eval */ }
        window.__tlPicker.lastPicked = {
          tag: t.tagName ? t.tagName.toLowerCase() : "",
          id:  t.id || "",
          classes: t.className && typeof t.className === "string" ? t.className : ""
        };
      }
      cleanup();
    }
    function onKey(e) {
      if (e.key === "Escape") { suppress(e); cleanup(); return; }
      if (e.key === "Alt")    { pinned = true; }
      if (e.key === "Tab" && current) {
        suppress(e);
        if (e.shiftKey) {
          // Walk DOWN to first element child.
          var firstChild = current.firstElementChild;
          if (firstChild) current = firstChild;
        } else {
          // Walk UP to parent.
          if (current.parentElement) current = current.parentElement;
        }
      }
    }
    function onKeyUp(e) { if (e.key === "Alt") pinned = false; }

    function cleanup() {
      cancelAnimationFrame(rafId);
      try { host.remove(); } catch (e) {}
      try { tip.remove();  } catch (e) {}
      if (document.body) document.body.style.cursor = prevCursor || "";
      // Symmetric removal — removeEventListener only matches when the
      // capture flag matches what was passed in. We registered with
      // { capture: true, passive: false }; the boolean true would also
      // match (since only "capture" is keyed), but using the same
      // object shape is the safest convention.
      EVENT_NAMES.forEach(function (n) {
        try { document.removeEventListener(n, ROUTER, ACTIVE_CAPTURE); } catch (e) {}
      });
      try { document.removeEventListener("keydown", onKey,   ACTIVE_CAPTURE); } catch (e) {}
      try { document.removeEventListener("keyup",   onKeyUp, ACTIVE_CAPTURE); } catch (e) {}
      try { window.removeEventListener("resize", reposition, true); } catch (e) {}
      try { window.removeEventListener("scroll", reposition, true); } catch (e) {}

      /* Trailing-click eater: when we commit on pointerup/touchend the
         browser still has a click (and possibly auxclick / contextmenu)
         event queued from the same gesture. Our normal suppressor is
         already removed by the time those fire, so they would reach the
         page and trigger navigation or button activation. Install a
         one-shot capture-phase suppressor for ~150 ms after cleanup;
         long enough to swallow any pending event, short enough that it
         doesn't interfere with subsequent user clicks. */
      function eatTrailing(ev) {
        if (ev.cancelable !== false) {
          try { ev.preventDefault(); } catch (e) {}
        }
        try { ev.stopPropagation(); } catch (e) {}
        try { ev.stopImmediatePropagation && ev.stopImmediatePropagation(); } catch (e) {}
      }
      var TRAILING = ["click", "auxclick", "contextmenu"];
      TRAILING.forEach(function (n) {
        try { document.addEventListener(n, eatTrailing, ACTIVE_CAPTURE); } catch (e) {}
      });
      setTimeout(function () {
        TRAILING.forEach(function (n) {
          try { document.removeEventListener(n, eatTrailing, ACTIVE_CAPTURE); } catch (e) {}
        });
      }, 150);

      window.__tlPicker.active = false;
    }
    function reposition() { if (current) paint(current); }

    /* Event names we listen to in capture-phase + suppress unless we pick.
       Covers every channel a click could leak to native handlers. Touch
       and wheel events are PASSIVE BY DEFAULT in Chrome — registering with
       just useCapture=true would let preventDefault be silently ignored,
       triggering the "Intervention: Unable to preventDefault inside passive
       event listener" warning AND letting the underlying click navigate.
       We must opt out explicitly via { passive: false }. */
    var EVENT_NAMES = [
      "pointermove","pointerdown","pointerup","pointerover","pointerleave",
      "mousedown","mouseup","mousemove","mouseover","mouseout","mouseenter","mouseleave",
      "click","auxclick","dblclick",
      "contextmenu","dragstart",
      "touchstart","touchmove","touchend","touchcancel",
      "wheel"
    ];
    /* {capture:true, passive:false} — capture so we see events before any
       page handler, passive:false so preventDefault actually applies even
       for touch/wheel events that Chrome marks passive by default. */
    var ACTIVE_CAPTURE = { capture: true, passive: false };
    function ROUTER(e) {
      // We always read coordinates first (touch events have them on
      // touches[0], not on the event itself).
      if (e.touches && e.touches[0]) {
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      } else if (typeof e.clientX === "number") {
        lastX = e.clientX; lastY = e.clientY;
      }
      var t = e.type;
      if (t === "pointermove" || t === "mousemove" || t === "touchmove" || t === "pointerover") {
        if (!pinned) {
          var hit = pickAt(lastX, lastY);
          if (hit) current = hit;
        }
        // Don't suppress mousemove — that would block our own move tracking.
        return;
      }
      if (t === "click" || t === "pointerup" || t === "touchend") {
        // pointerup/touchend can fire without a paired click on some elements
        // (e.g. PWA install sheets) — handle them as completion candidates.
        suppress(e);
        if (t !== "click") {
          // For touchend / pointerup, only commit on the FIRST one (the
          // click event will fire next; we want to beat it but not double-pick).
          var t2 = current || pickAt(lastX, lastY);
          if (t2) {
            try { inspect(t2); } catch (err) {}
            window.__tlPicker.lastPicked = {
              tag: t2.tagName ? t2.tagName.toLowerCase() : "",
              id:  t2.id || "",
              classes: t2.className && typeof t2.className === "string" ? t2.className : ""
            };
          }
          cleanup();
          return;
        }
        onClick(e);
        return;
      }
      // All other event types: suppress so the page can't react.
      suppress(e);
    }
    EVENT_NAMES.forEach(function (n) {
      try { document.addEventListener(n, ROUTER, ACTIVE_CAPTURE); } catch (e) {}
    });
    document.addEventListener("keydown", onKey,   ACTIVE_CAPTURE);
    document.addEventListener("keyup",   onKeyUp, ACTIVE_CAPTURE);
    // resize/scroll only need to re-paint — they're not events we suppress,
    // so the default passive mode is fine and slightly cheaper.
    window.addEventListener("resize", reposition, true);
    window.addEventListener("scroll", reposition, true);

    window.__tlPicker = { active: true, cancel: cleanup, lastPicked: null };
  })();`,

  /**
   * Stop the picker explicitly (panel button toggles off, or panel close).
   * Calls the page-side cleanup callback if the picker is still active.
   * Safe to call when no picker is running.
   */
  stopPicker: `(function(){if(window.__tlPicker&&window.__tlPicker.active&&typeof window.__tlPicker.cancel==="function"){window.__tlPicker.cancel();}})();`,

  /** Read picker active flag (panel uses this to sync toggle button state). */
  isPickerActive: `(function(){return !!(window.__tlPicker&&window.__tlPicker.active);})();`,

  /**
   * Read the most-recently-picked descriptor (and clear it). Mostly a
   * fallback for environments where `inspect()` isn't available — the
   * happy path uses Chrome's elements-panel selection event instead.
   */
  readPicked: `(function(){if(!window.__tlPicker||!window.__tlPicker.lastPicked)return null;var p=window.__tlPicker.lastPicked;window.__tlPicker.lastPicked=null;return JSON.stringify(p);})();`,

  /** Promote the most-recently-picked element to $0 (legacy fallback). */
  inspectPicked: `(function(){if(window.__tlPicker&&window.__tlPicker.lastPicked){/* lastPicked is a descriptor; if we still have a live ref via inspect() it already happened. */}})();`,
};
