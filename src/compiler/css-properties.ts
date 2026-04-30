/**
 * traceless-style — compiler/css-properties.ts
 *
 * Runtime allowlist of valid CSS property names. The list is curated from
 * the CSSProperties type in ../types/css.ts so the compile-time and
 * runtime checks see the same world.
 *
 * Why an explicit list (rather than "anything that looks like an
 * identifier")?
 *
 *   - It catches typos at build time. `colour: "red"` becomes a build
 *     error pointing at the closest match instead of silent dead CSS.
 *   - It removes one degree of freedom from the value-injection attack
 *     surface: a malicious property name can't smuggle CSS through.
 *
 * Things this allowlist accepts BEYOND the explicit set:
 *   - CSS variables: `--anything`
 *   - Vendor-prefixed: `-webkit-*`, `-moz-*`, `-ms-*`, `-o-*`
 *
 * If a real, modern CSS property is missing here, add it to KNOWN_PROPS.
 */

const KNOWN_PROPS = new Set<string>([
  // Display & visibility
  "display", "visibility", "opacity",

  // Position
  "position", "top", "bottom", "left", "right",
  "inset", "insetBlock", "insetInline",
  "insetBlockStart", "insetBlockEnd",
  "insetInlineStart", "insetInlineEnd",
  "zIndex",

  // Overflow
  "overflow", "overflowX", "overflowY", "overflowAnchor",
  "overflowWrap", "overscrollBehavior",
  "overscrollBehaviorX", "overscrollBehaviorY",

  // Flex
  "flexDirection", "flexWrap", "flexFlow", "flex",
  "flexGrow", "flexShrink", "flexBasis", "order",
  "alignItems", "alignSelf", "alignContent",
  "justifyContent", "justifyItems", "justifySelf",
  "placeItems", "placeContent", "placeSelf",
  "gap", "rowGap", "columnGap",

  // Grid
  "gridTemplate", "gridTemplateColumns", "gridTemplateRows",
  "gridTemplateAreas", "gridArea", "gridColumn", "gridRow",
  "gridColumnStart", "gridColumnEnd", "gridRowStart", "gridRowEnd",
  "gridAutoFlow", "gridAutoColumns", "gridAutoRows",

  // Sizing
  "width", "height", "minWidth", "minHeight",
  "maxWidth", "maxHeight", "aspectRatio", "boxSizing",

  // Padding
  "padding", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
  "paddingInline", "paddingBlock",
  "paddingInlineStart", "paddingInlineEnd",
  "paddingBlockStart", "paddingBlockEnd",

  // Margin
  "margin", "marginTop", "marginBottom", "marginLeft", "marginRight",
  "marginInline", "marginBlock",
  "marginInlineStart", "marginInlineEnd",
  "marginBlockStart", "marginBlockEnd",

  // Typography
  "fontFamily", "fontSize", "fontWeight", "fontStyle",
  "fontVariant", "fontStretch", "lineHeight",
  "letterSpacing", "wordSpacing",
  "textAlign", "textAlignLast", "textTransform",
  "textDecoration", "textDecorationColor", "textDecorationLine",
  "textDecorationStyle", "textDecorationThickness",
  "textUnderlineOffset", "textUnderlinePosition",
  "textOverflow", "textIndent", "textShadow", "textRendering", "textWrap",
  "whiteSpace", "whiteSpaceCollapse",
  "wordBreak", "hyphens",
  "direction", "unicodeBidi", "writingMode",

  // Colors & backgrounds
  "color", "caretColor", "accentColor", "backgroundColor",
  "background", "backgroundImage", "backgroundSize", "backgroundPosition",
  "backgroundRepeat", "backgroundAttachment",
  "backgroundClip", "backgroundOrigin", "backgroundBlendMode",

  // Border
  "border", "borderTop", "borderBottom", "borderLeft", "borderRight",
  "borderBlock", "borderInline",
  "borderBlockStart", "borderBlockEnd",
  "borderInlineStart", "borderInlineEnd",
  "borderWidth", "borderTopWidth", "borderBottomWidth",
  "borderLeftWidth", "borderRightWidth",
  "borderStyle", "borderColor",
  "borderTopColor", "borderBottomColor",
  "borderLeftColor", "borderRightColor",
  "borderRadius",
  "borderTopLeftRadius", "borderTopRightRadius",
  "borderBottomLeftRadius", "borderBottomRightRadius",
  "borderStartStartRadius", "borderStartEndRadius",
  "borderEndStartRadius", "borderEndEndRadius",
  "borderCollapse", "borderSpacing", "borderImage",
  "outline", "outlineColor", "outlineStyle", "outlineWidth", "outlineOffset",

  // Effects
  "boxShadow", "filter", "backdropFilter", "mixBlendMode",
  "isolation", "clipPath", "mask", "maskImage",

  // Transforms
  "transform", "transformOrigin", "transformBox", "transformStyle",
  "perspective", "perspectiveOrigin", "backfaceVisibility",
  "translate", "rotate", "scale",

  // Transitions
  "transition", "transitionProperty", "transitionDuration",
  "transitionTimingFunction", "transitionDelay",

  // Animations
  "animation", "animationName", "animationDuration",
  "animationTimingFunction", "animationDelay",
  "animationIterationCount", "animationDirection",
  "animationFillMode", "animationPlayState", "animationComposition",
  "willChange",

  // Interactions
  "cursor", "pointerEvents", "userSelect", "touchAction",
  "resize", "appearance",

  // Scrolling
  "scrollBehavior", "scrollSnapType", "scrollSnapAlign", "scrollSnapStop",
  "scrollMargin", "scrollPadding",

  // Object fit
  "objectFit", "objectPosition",

  // Lists
  "listStyle", "listStyleType", "listStylePosition", "listStyleImage",
  "counterReset", "counterIncrement", "counterSet",

  // Tables
  "tableLayout", "captionSide", "emptyCells", "verticalAlign",

  // Multi-column
  "columns", "columnCount", "columnWidth",
  "columnRule", "columnRuleWidth", "columnRuleStyle", "columnRuleColor",
  "columnSpan", "columnFill",
  "breakBefore", "breakAfter", "breakInside",

  // Generated content
  "content", "quotes",

  // SVG
  "fill", "fillOpacity", "fillRule",
  "stroke", "strokeWidth", "strokeOpacity",
  "strokeLinecap", "strokeLinejoin",
  "strokeDasharray", "strokeDashoffset",
  "vectorEffect", "shapeRendering", "paintOrder",
  "markerStart", "markerMid", "markerEnd",

  // Print / pagination
  "pageBreakBefore", "pageBreakAfter", "pageBreakInside",
  "orphans", "widows",

  // Floats
  "float", "clear",

  // Misc
  "all", "boxDecorationBreak", "colorScheme",
  "containIntrinsicSize", "contain", "contentVisibility",
  "forcedColorAdjust", "printColorAdjust",
]);

/** Pattern-based acceptances that complement the explicit allowlist. */
function matchesAcceptedPattern(prop: string): boolean {
  // CSS custom properties: --foo, --foo-bar
  if (prop.startsWith("--")) return /^--[a-zA-Z_][\w-]*$/.test(prop);
  // Vendor-prefixed: -webkit-foo, -moz-foo, etc. (camelCase form: webkitFoo, mozFoo)
  if (/^(webkit|moz|ms|o)[A-Z]/.test(prop)) return true;
  // Vendor-prefixed kebab form
  if (/^-(webkit|moz|ms|o)-/.test(prop)) return true;
  return false;
}

/** True iff `prop` is a known CSS property or matches an accepted pattern. */
export function isKnownProperty(prop: string): boolean {
  return KNOWN_PROPS.has(prop) || matchesAcceptedPattern(prop);
}

/**
 * Read-only view of the property allowlist for tooling (VS Code extension,
 * docs site, codemods). Returned as a sorted array so iteration order is
 * stable across consumers.
 */
export function listKnownProperties(): string[] {
  return [...KNOWN_PROPS].sort();
}

/**
 * Suggest the closest known property when one is rejected. Used by the
 * extractor's error message ("Unknown CSS property 'colour' — did you
 * mean 'color'?"). Reuses the same Levenshtein helper inlined here so
 * we don't pull a dependency loop with extractor.ts.
 */
export function suggestClosestProperty(prop: string): string | null {
  if (prop.length < 2) return null;
  let best:     string | null = null;
  let bestDist:           number = Infinity;
  for (const p of KNOWN_PROPS) {
    const d = levenshtein(prop, p);
    if (d < bestDist && d <= 2) { bestDist = d; best = p; }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
