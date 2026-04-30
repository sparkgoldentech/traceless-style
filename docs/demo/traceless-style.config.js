/**
 * traceless-style.config.js — demo configuration
 *
 * Strict-by-default lint, WCAG AA contrast, plus custom breakpoints
 * (the same ones declared via tl.extend in src/variants.ts; declaring
 * them here too is optional — Pass 1 picks them up either way).
 */
module.exports = {
  srcDir: "src",

  lint: {
    noInlineStyles: true,    // (always on)
    noClassString:  true,
    noCSSModules:   true,
    noTailwind:     true,
  },

  autoDarkMode: true,
  autoRtl:      true,

  contrast: {
    level:  "AA",
    strict: false,           // warn, don't fail the build
  },
};
