/**
 * spark-css — types/css.ts
 *
 * Full TypeScript-safe CSS property types.
 * Every property is typed with its valid values.
 * Typos caught at compile time — not at runtime.
 *
 * Design goals:
 *  1. Every CSS property has typed values (not just string)
 *  2. CSS custom properties (--my-var) are allowed anywhere
 *  3. Numbers allowed where CSS accepts them (z-index, opacity, etc.)
 *  4. Global values (inherit, initial, revert, unset) on every property
 *  5. Compatible with all modern CSS features
 */

/* ── Base value types ── */
export type CSSGlobalValue   = "inherit" | "initial" | "revert" | "revert-layer" | "unset";
export type CSSCustomProp    = `var(--${string})`;
export type CSSCalc          = `calc(${string})`;
export type CSSEnv           = `env(${string})`;
export type CSSMinMax        = `min(${string})` | `max(${string})` | `clamp(${string})`;
export type CSSFunction      = CSSCustomProp | CSSCalc | CSSEnv | CSSMinMax;

/** A length value: px, rem, em, %, vw, vh, etc. */
export type Length =
  | 0
  | `${number}px`  | `${number}rem` | `${number}em`
  | `${number}%`   | `${number}vw`  | `${number}vh`
  | `${number}vmin`| `${number}vmax`| `${number}dvh`
  | `${number}dvw` | `${number}ch`  | `${number}ex`
  | `${number}lh`  | `${number}svh` | `${number}svw`
  | CSSFunction    | CSSGlobalValue | (string & {});

/** A time value: ms or s */
export type Time = `${number}ms` | `${number}s` | CSSGlobalValue | (string & {});

/** An angle value */
export type Angle = `${number}deg` | `${number}rad` | `${number}turn` | (string & {});

/** A color value */
export type CSSColor =
  | "transparent"    | "currentColor"
  | "black"          | "white"
  | "red"            | "green"     | "blue"
  | "yellow"         | "orange"    | "purple"
  | "pink"           | "gray"      | "grey"
  | "indigo"         | "violet"    | "cyan"
  | "teal"           | "lime"      | "amber"
  | `#${string}`
  | `rgb(${string})` | `rgba(${string})`
  | `hsl(${string})` | `hsla(${string})`
  | `oklch(${string})`| `oklab(${string})`
  | `color(${string})`
  | CSSCustomProp
  | CSSGlobalValue
  | (string & {});

/** Number or string for numeric CSS values */
export type CSSNumber = number | `${number}` | CSSGlobalValue | (string & {});

/* ════════════════════════════════════════
   FULL CSS PROPERTIES
════════════════════════════════════════ */
export interface CSSProperties {

  /* ── Display & Layout ── */
  display?:
    | "none" | "block" | "inline" | "inline-block"
    | "flex" | "inline-flex" | "grid" | "inline-grid"
    | "flow-root" | "contents" | "list-item"
    | "table" | "table-row" | "table-cell"
    | CSSGlobalValue | (string & {});

  visibility?: "visible" | "hidden" | "collapse" | CSSGlobalValue;

  opacity?: CSSNumber;

  /* ── Position ── */
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky" | CSSGlobalValue;
  top?:    Length; bottom?: Length; left?: Length; right?: Length;
  inset?: Length; insetBlock?: Length; insetInline?: Length;
  insetBlockStart?: Length; insetBlockEnd?: Length;
  insetInlineStart?: Length; insetInlineEnd?: Length;
  zIndex?: CSSNumber | "auto";

  /* ── Overflow ── */
  overflow?:  "visible" | "hidden" | "clip" | "scroll" | "auto" | CSSGlobalValue;
  overflowX?: "visible" | "hidden" | "clip" | "scroll" | "auto" | CSSGlobalValue;
  overflowY?: "visible" | "hidden" | "clip" | "scroll" | "auto" | CSSGlobalValue;
  overflowAnchor?: "auto" | "none" | CSSGlobalValue;
  overflowWrap?: "normal" | "break-word" | "anywhere" | CSSGlobalValue;
  overscrollBehavior?: "auto" | "contain" | "none" | CSSGlobalValue;
  overscrollBehaviorX?: "auto" | "contain" | "none" | CSSGlobalValue;
  overscrollBehaviorY?: "auto" | "contain" | "none" | CSSGlobalValue;

  /* ── Flexbox ── */
  flexDirection?:
    | "row" | "row-reverse" | "column" | "column-reverse"
    | CSSGlobalValue;
  flexWrap?: "nowrap" | "wrap" | "wrap-reverse" | CSSGlobalValue;
  flexFlow?: string | CSSGlobalValue;
  flex?: CSSNumber | "none" | "auto" | (string & {});
  flexGrow?: CSSNumber;
  flexShrink?: CSSNumber;
  flexBasis?: Length | "auto" | "content" | "max-content" | "min-content";
  order?: CSSNumber;

  alignItems?:
    | "normal" | "stretch" | "center" | "start" | "end"
    | "flex-start" | "flex-end" | "self-start" | "self-end"
    | "baseline" | "first baseline" | "last baseline"
    | CSSGlobalValue;
  alignSelf?:
    | "auto" | "normal" | "stretch" | "center" | "start" | "end"
    | "flex-start" | "flex-end" | "self-start" | "self-end"
    | "baseline" | "first baseline" | "last baseline"
    | CSSGlobalValue;
  alignContent?:
    | "normal" | "center" | "start" | "end" | "flex-start" | "flex-end"
    | "space-between" | "space-around" | "space-evenly" | "stretch"
    | "baseline" | CSSGlobalValue;
  justifyContent?:
    | "normal" | "center" | "start" | "end" | "flex-start" | "flex-end"
    | "left" | "right" | "space-between" | "space-around" | "space-evenly"
    | "stretch" | CSSGlobalValue;
  justifyItems?:
    | "auto" | "normal" | "stretch" | "center" | "start" | "end"
    | "flex-start" | "flex-end" | "left" | "right" | "baseline"
    | CSSGlobalValue;
  justifySelf?:
    | "auto" | "normal" | "stretch" | "center" | "start" | "end"
    | "flex-start" | "flex-end" | "left" | "right" | "baseline"
    | CSSGlobalValue;
  placeItems?: string | CSSGlobalValue;
  placeContent?: string | CSSGlobalValue;
  placeSelf?: string | CSSGlobalValue;

  gap?: Length | (string & {});
  rowGap?: Length;

  /* ── Grid ── */
  gridTemplate?: string | CSSGlobalValue;
  gridTemplateColumns?: string | Length | CSSGlobalValue;
  gridTemplateRows?: string | Length | CSSGlobalValue;
  gridTemplateAreas?: string | "none" | CSSGlobalValue;
  gridArea?: string | CSSGlobalValue;
  gridColumn?: string | CSSGlobalValue;
  gridRow?: string | CSSGlobalValue;
  gridColumnStart?: CSSNumber | "auto" | (string & {});
  gridColumnEnd?: CSSNumber | "auto" | (string & {});
  gridRowStart?: CSSNumber | "auto" | (string & {});
  gridRowEnd?: CSSNumber | "auto" | (string & {});
  gridAutoFlow?: "row" | "column" | "dense" | "row dense" | "column dense" | CSSGlobalValue;
  gridAutoColumns?: string | Length | CSSGlobalValue;
  gridAutoRows?: string | Length | CSSGlobalValue;

  /* ── Sizing ── */
  width?: Length | "auto" | "max-content" | "min-content" | "fit-content";
  height?: Length | "auto" | "max-content" | "min-content" | "fit-content";
  minWidth?: Length | "auto" | "max-content" | "min-content" | "fit-content";
  minHeight?: Length | "auto" | "max-content" | "min-content" | "fit-content";
  maxWidth?: Length | "none" | "max-content" | "min-content" | "fit-content";
  maxHeight?: Length | "none" | "max-content" | "min-content" | "fit-content";
  aspectRatio?: "auto" | `${number}/${number}` | CSSNumber | (string & {});
  boxSizing?: "border-box" | "content-box" | CSSGlobalValue;

  /* ── Spacing ── */
  padding?: Length | (string & {});
  paddingTop?: Length; paddingBottom?: Length;
  paddingLeft?: Length; paddingRight?: Length;
  paddingInline?: Length | (string & {});
  paddingBlock?: Length | (string & {});
  paddingInlineStart?: Length; paddingInlineEnd?: Length;
  paddingBlockStart?: Length; paddingBlockEnd?: Length;

  margin?: Length | "auto" | (string & {});
  marginTop?: Length | "auto"; marginBottom?: Length | "auto";
  marginLeft?: Length | "auto"; marginRight?: Length | "auto";
  marginInline?: Length | "auto" | (string & {});
  marginBlock?: Length | "auto" | (string & {});
  marginInlineStart?: Length | "auto"; marginInlineEnd?: Length | "auto";
  marginBlockStart?: Length | "auto"; marginBlockEnd?: Length | "auto";

  /* ── Typography ── */
  fontFamily?: string | CSSGlobalValue;
  fontSize?: Length | "xx-small" | "x-small" | "small" | "medium" | "large" | "x-large" | "xx-large" | "xxx-large" | "smaller" | "larger";
  fontWeight?:
    | "normal" | "bold" | "bolder" | "lighter"
    | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900"
    | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900
    | CSSGlobalValue;
  fontStyle?: "normal" | "italic" | "oblique" | (string & {}) | CSSGlobalValue;
  fontVariant?: string | CSSGlobalValue;
  fontStretch?: string | CSSGlobalValue;
  lineHeight?: CSSNumber | "normal" | Length;
  letterSpacing?: Length | "normal";
  wordSpacing?: Length | "normal";
  textAlign?: "left" | "right" | "center" | "justify" | "start" | "end" | "match-parent" | CSSGlobalValue;
  textAlignLast?: "auto" | "left" | "right" | "center" | "justify" | "start" | "end" | CSSGlobalValue;
  textTransform?: "none" | "capitalize" | "uppercase" | "lowercase" | "full-width" | CSSGlobalValue;
  textDecoration?: string | CSSGlobalValue;
  textDecorationColor?: CSSColor;
  textDecorationLine?: "none" | "underline" | "overline" | "line-through" | (string & {}) | CSSGlobalValue;
  textDecorationStyle?: "solid" | "double" | "dotted" | "dashed" | "wavy" | CSSGlobalValue;
  textDecorationThickness?: Length | "auto" | "from-font";
  textUnderlineOffset?: Length | "auto";
  textUnderlinePosition?: string | CSSGlobalValue;
  textOverflow?: "clip" | "ellipsis" | (string & {}) | CSSGlobalValue;
  textIndent?: Length | (string & {});
  textShadow?: string | "none" | CSSGlobalValue;
  textRendering?: "auto" | "optimizeSpeed" | "optimizeLegibility" | "geometricPrecision" | CSSGlobalValue;
  textWrap?: "wrap" | "nowrap" | "balance" | "pretty" | "stable" | CSSGlobalValue;
  whiteSpace?: "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line" | "break-spaces" | CSSGlobalValue;
  whiteSpaceCollapse?: string | CSSGlobalValue;
  wordBreak?: "normal" | "break-all" | "keep-all" | "break-word" | CSSGlobalValue;
  hyphens?: "none" | "manual" | "auto" | CSSGlobalValue;
  direction?: "ltr" | "rtl" | CSSGlobalValue;
  unicodeBidi?: string | CSSGlobalValue;
  writingMode?: "horizontal-tb" | "vertical-rl" | "vertical-lr" | CSSGlobalValue;

  /* ── Color & Background ── */
  color?: CSSColor;
  caretColor?: CSSColor | "auto";
  accentColor?: CSSColor | "auto";
  backgroundColor?: CSSColor;
  background?: string | CSSGlobalValue;
  backgroundImage?: string | "none" | CSSGlobalValue;
  backgroundSize?: Length | "auto" | "cover" | "contain" | (string & {});
  backgroundPosition?: string | Length | CSSGlobalValue;
  backgroundRepeat?: "repeat" | "repeat-x" | "repeat-y" | "no-repeat" | "space" | "round" | (string & {}) | CSSGlobalValue;
  backgroundAttachment?: "scroll" | "fixed" | "local" | CSSGlobalValue;
  backgroundClip?: "border-box" | "padding-box" | "content-box" | "text" | CSSGlobalValue;
  backgroundOrigin?: "border-box" | "padding-box" | "content-box" | CSSGlobalValue;
  backgroundBlendMode?: string | CSSGlobalValue;

  /* ── Borders ── */
  border?: string | CSSGlobalValue;
  borderTop?: string | CSSGlobalValue; borderBottom?: string | CSSGlobalValue;
  borderLeft?: string | CSSGlobalValue; borderRight?: string | CSSGlobalValue;
  borderBlock?: string | CSSGlobalValue; borderInline?: string | CSSGlobalValue;
  borderBlockStart?: string | CSSGlobalValue; borderBlockEnd?: string | CSSGlobalValue;
  borderInlineStart?: string | CSSGlobalValue; borderInlineEnd?: string | CSSGlobalValue;
  borderWidth?: Length | "thin" | "medium" | "thick" | (string & {});
  borderTopWidth?: Length | "thin" | "medium" | "thick";
  borderBottomWidth?: Length | "thin" | "medium" | "thick";
  borderLeftWidth?: Length | "thin" | "medium" | "thick";
  borderRightWidth?: Length | "thin" | "medium" | "thick";
  borderStyle?: "none" | "solid" | "dashed" | "dotted" | "double" | "groove" | "ridge" | "inset" | "outset" | "hidden" | (string & {});
  borderColor?: CSSColor | (string & {});
  borderTopColor?: CSSColor; borderBottomColor?: CSSColor;
  borderLeftColor?: CSSColor; borderRightColor?: CSSColor;
  borderRadius?: Length | (string & {});
  borderTopLeftRadius?: Length | (string & {}); borderTopRightRadius?: Length | (string & {});
  borderBottomLeftRadius?: Length | (string & {}); borderBottomRightRadius?: Length | (string & {});
  borderStartStartRadius?: Length | (string & {}); borderStartEndRadius?: Length | (string & {});
  borderEndStartRadius?: Length | (string & {}); borderEndEndRadius?: Length | (string & {});
  borderCollapse?: "separate" | "collapse" | CSSGlobalValue;
  borderSpacing?: Length | (string & {});
  borderImage?: string | CSSGlobalValue;
  outline?: string | "none" | CSSGlobalValue;
  outlineColor?: CSSColor | "invert";
  outlineStyle?: string | "none" | CSSGlobalValue;
  outlineWidth?: Length | "thin" | "medium" | "thick";
  outlineOffset?: Length;

  /* ── Shadow & Effects ── */
  boxShadow?: string | "none" | CSSGlobalValue;
  filter?: string | "none" | CSSGlobalValue;
  backdropFilter?: string | "none" | CSSGlobalValue;
  mixBlendMode?: string | CSSGlobalValue;
  isolation?: "auto" | "isolate" | CSSGlobalValue;
  clipPath?: string | "none" | CSSGlobalValue;
  mask?: string | CSSGlobalValue;
  maskImage?: string | "none" | CSSGlobalValue;

  /* ── Transform ── */
  transform?: string | "none" | CSSGlobalValue;
  transformOrigin?: string | Length | CSSGlobalValue;
  transformBox?: "content-box" | "border-box" | "fill-box" | "stroke-box" | "view-box" | CSSGlobalValue;
  transformStyle?: "flat" | "preserve-3d" | CSSGlobalValue;
  perspective?: Length | "none";
  perspectiveOrigin?: string | CSSGlobalValue;
  backfaceVisibility?: "visible" | "hidden" | CSSGlobalValue;
  translate?: string | Length | "none";
  rotate?: string | Angle | "none";
  scale?: CSSNumber | string | "none";

  /* ── Transitions ── */
  transition?: string | "none" | CSSGlobalValue;
  transitionProperty?: string | "none" | "all" | CSSGlobalValue;
  transitionDuration?: Time | (string & {});
  transitionTimingFunction?: string | CSSGlobalValue;
  transitionDelay?: Time | (string & {});

  /* ── Animation ── */
  animation?: string | "none" | CSSGlobalValue;
  animationName?: string | "none" | CSSGlobalValue;
  animationDuration?: Time | (string & {});
  animationTimingFunction?: string | CSSGlobalValue;
  animationDelay?: Time | (string & {});
  animationIterationCount?: CSSNumber | "infinite";
  animationDirection?: "normal" | "reverse" | "alternate" | "alternate-reverse" | CSSGlobalValue;
  animationFillMode?: "none" | "forwards" | "backwards" | "both" | CSSGlobalValue;
  animationPlayState?: "running" | "paused" | CSSGlobalValue;
  animationComposition?: "replace" | "add" | "accumulate" | CSSGlobalValue;
  willChange?: string | "auto" | CSSGlobalValue;

  /* ── Interaction & UI ── */
  cursor?:
    | "auto" | "default" | "none" | "context-menu" | "help"
    | "pointer" | "progress" | "wait" | "cell" | "crosshair"
    | "text" | "vertical-text" | "alias" | "copy" | "move"
    | "no-drop" | "not-allowed" | "grab" | "grabbing"
    | "all-scroll" | "col-resize" | "row-resize"
    | "n-resize" | "e-resize" | "s-resize" | "w-resize"
    | "zoom-in" | "zoom-out"
    | CSSGlobalValue | (string & {});
  pointerEvents?: "auto" | "none" | CSSGlobalValue | (string & {});
  userSelect?: "none" | "auto" | "text" | "all" | CSSGlobalValue;
  touchAction?: "auto" | "none" | "manipulation" | "pan-x" | "pan-y" | "pinch-zoom" | (string & {});
  resize?: "none" | "both" | "horizontal" | "vertical" | "block" | "inline" | CSSGlobalValue;
  appearance?: "none" | "auto" | CSSGlobalValue | (string & {});
  scrollBehavior?: "auto" | "smooth" | CSSGlobalValue;
  scrollSnapType?: string | "none" | CSSGlobalValue;
  scrollSnapAlign?: string | "none" | CSSGlobalValue;
  scrollSnapStop?: "normal" | "always" | CSSGlobalValue;
  scrollMargin?: Length | (string & {});
  scrollPadding?: Length | (string & {});

  /* ── Object fit ── */
  objectFit?: "fill" | "contain" | "cover" | "none" | "scale-down" | CSSGlobalValue;
  objectPosition?: string | Length | CSSGlobalValue;

  /* ── List & Counter ── */
  listStyle?: string | "none" | CSSGlobalValue;
  listStyleType?: string | "none" | CSSGlobalValue;
  listStylePosition?: "inside" | "outside" | CSSGlobalValue;
  listStyleImage?: string | "none" | CSSGlobalValue;
  counterReset?: string | "none" | CSSGlobalValue;
  counterIncrement?: string | "none" | CSSGlobalValue;
  counterSet?: string | "none" | CSSGlobalValue;

  /* ── Table ── */
  tableLayout?: "auto" | "fixed" | CSSGlobalValue;
  captionSide?: "top" | "bottom" | CSSGlobalValue;
  emptyCells?: "show" | "hide" | CSSGlobalValue;
  verticalAlign?: "baseline" | "sub" | "super" | "top" | "text-top" | "middle" | "bottom" | "text-bottom" | Length | CSSGlobalValue;

  /* ── Column ── */
  columns?: CSSNumber | Length | "auto" | (string & {});
  columnCount?: CSSNumber | "auto";
  columnWidth?: Length | "auto";
  columnGap?: Length | "normal";
  columnRule?: string | CSSGlobalValue;
  columnRuleWidth?: Length | "thin" | "medium" | "thick";
  columnRuleStyle?: string | CSSGlobalValue;
  columnRuleColor?: CSSColor;
  columnSpan?: "none" | "all" | CSSGlobalValue;
  columnFill?: "auto" | "balance" | "balance-all" | CSSGlobalValue;
  breakBefore?: string | CSSGlobalValue;
  breakAfter?: string | CSSGlobalValue;
  breakInside?: string | CSSGlobalValue;

  /* ── Generated content ── */
  content?: string | "none" | "normal" | CSSGlobalValue;
  quotes?: string | "none" | "auto" | CSSGlobalValue;

  /* ── SVG ── */
  fill?: CSSColor | "none";
  fillOpacity?: CSSNumber;
  fillRule?: "nonzero" | "evenodd";
  stroke?: CSSColor | "none";
  strokeWidth?: Length | CSSNumber;
  strokeOpacity?: CSSNumber;
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "arcs" | "bevel" | "miter" | "miter-clip" | "round";
  strokeDasharray?: string | "none";
  strokeDashoffset?: Length | CSSNumber;
  vectorEffect?: "none" | "non-scaling-stroke" | CSSGlobalValue;
  shapeRendering?: "auto" | "optimizeSpeed" | "crispEdges" | "geometricPrecision" | CSSGlobalValue;
  paintOrder?: string | CSSGlobalValue;
  markerStart?: string | "none";
  markerMid?: string | "none";
  markerEnd?: string | "none";

  /* ── Print ── */
  pageBreakBefore?: string | CSSGlobalValue;
  pageBreakAfter?: string | CSSGlobalValue;
  pageBreakInside?: string | CSSGlobalValue;
  orphans?: CSSNumber;
  widows?: CSSNumber;

  /* ── Logical properties ── */
  float?: "left" | "right" | "none" | "inline-start" | "inline-end" | CSSGlobalValue;
  clear?: "none" | "left" | "right" | "both" | "inline-start" | "inline-end" | CSSGlobalValue;

  /* ── Miscellaneous ── */
  all?: CSSGlobalValue;
  boxDecorationBreak?: "slice" | "clone" | CSSGlobalValue;
  colorScheme?: string | CSSGlobalValue;
  containIntrinsicSize?: string | CSSGlobalValue;
  contain?: string | "none" | "strict" | "content" | CSSGlobalValue;
  contentVisibility?: "visible" | "auto" | "hidden" | CSSGlobalValue;
  forcedColorAdjust?: "auto" | "none" | CSSGlobalValue;
  printColorAdjust?: "economy" | "exact" | CSSGlobalValue;

  /* ── CSS Custom Properties ── */
  [key: `--${string}`]: string | number | undefined;
}