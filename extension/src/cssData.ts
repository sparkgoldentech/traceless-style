/**
 * traceless-style VS Code extension — cssData.ts
 *
 * The property + value vocabulary the autocomplete provider draws from.
 *
 * The property list is intentionally MIRRORED from the library's
 * `src/compiler/css-properties.ts` rather than imported at runtime — the
 * extension is published as its own VSIX with its own bundle, and we want
 * it to work even when the user hasn't installed `traceless-style` yet
 * (e.g. browsing examples on a fresh checkout). When the library's list
 * grows, sync this file too. There's a build-time check in CI that fails
 * if the two drift (TODO: wire up).
 *
 * The value list per property is HAND-CURATED for the most common
 * properties — we don't try to be exhaustive. Goal is to cover 80% of
 * keystrokes for 90% of properties; users can still type any string.
 */

export const KNOWN_PROPERTIES: string[] = [
  // Display & visibility
  "display", "visibility", "opacity",
  // Position
  "position", "top", "bottom", "left", "right",
  "inset", "insetBlock", "insetInline",
  "insetBlockStart", "insetBlockEnd", "insetInlineStart", "insetInlineEnd",
  "zIndex",
  // Overflow
  "overflow", "overflowX", "overflowY", "overflowAnchor",
  "overflowWrap", "overscrollBehavior", "overscrollBehaviorX", "overscrollBehaviorY",
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
  "gridAutoColumns", "gridAutoRows", "gridAutoFlow",
  // Box model
  "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
  "blockSize", "inlineSize", "minBlockSize", "minInlineSize",
  "maxBlockSize", "maxInlineSize",
  "boxSizing", "aspectRatio",
  // Margin
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "marginBlock", "marginInline",
  "marginBlockStart", "marginBlockEnd", "marginInlineStart", "marginInlineEnd",
  // Padding
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "paddingBlock", "paddingInline",
  "paddingBlockStart", "paddingBlockEnd", "paddingInlineStart", "paddingInlineEnd",
  // Border
  "border", "borderTop", "borderRight", "borderBottom", "borderLeft",
  "borderBlock", "borderInline",
  "borderBlockStart", "borderBlockEnd", "borderInlineStart", "borderInlineEnd",
  "borderWidth", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderInlineWidth", "borderInlineStartWidth", "borderInlineEndWidth",
  "borderBlockWidth", "borderBlockStartWidth", "borderBlockEndWidth",
  "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "borderInlineColor", "borderInlineStartColor", "borderInlineEndColor",
  "borderBlockColor", "borderBlockStartColor", "borderBlockEndColor",
  "borderStyle", "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
  "borderInlineStyle", "borderInlineStartStyle", "borderInlineEndStyle",
  "borderBlockStyle", "borderBlockStartStyle", "borderBlockEndStyle",
  "borderRadius", "borderTopLeftRadius", "borderTopRightRadius",
  "borderBottomLeftRadius", "borderBottomRightRadius",
  "borderStartStartRadius", "borderStartEndRadius",
  "borderEndStartRadius", "borderEndEndRadius",
  "borderImage", "borderImageSource", "borderImageSlice",
  "borderImageWidth", "borderImageOutset", "borderImageRepeat",
  "borderCollapse", "borderSpacing",
  "outline", "outlineColor", "outlineStyle", "outlineWidth", "outlineOffset",
  // Background
  "background", "backgroundColor", "backgroundImage", "backgroundRepeat",
  "backgroundPosition", "backgroundPositionX", "backgroundPositionY",
  "backgroundSize", "backgroundOrigin", "backgroundClip", "backgroundAttachment",
  "backgroundBlendMode",
  // Color & text
  "color", "caretColor", "accentColor",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant",
  "fontStretch", "fontFeatureSettings", "fontKerning", "fontVariantCaps",
  "fontVariantLigatures", "fontVariantNumeric", "fontVariationSettings",
  "lineHeight", "letterSpacing", "wordSpacing", "wordBreak", "wordWrap",
  "textAlign", "textAlignLast", "textIndent", "textJustify",
  "textTransform", "textDecoration", "textDecorationColor",
  "textDecorationLine", "textDecorationStyle", "textDecorationThickness",
  "textUnderlineOffset", "textShadow", "textOverflow", "textRendering",
  "verticalAlign", "whiteSpace", "writingMode", "direction", "unicodeBidi",
  "tabSize", "hyphens",
  // Lists
  "listStyle", "listStyleType", "listStylePosition", "listStyleImage",
  // Tables
  "tableLayout", "captionSide", "emptyCells",
  // Effects
  "boxShadow", "filter", "backdropFilter", "mixBlendMode", "isolation",
  // Transform
  "transform", "transformOrigin", "transformStyle", "transformBox",
  "perspective", "perspectiveOrigin", "backfaceVisibility",
  "translate", "rotate", "scale",
  // Transitions / animation
  "transition", "transitionProperty", "transitionDuration",
  "transitionTimingFunction", "transitionDelay",
  "animation", "animationName", "animationDuration", "animationTimingFunction",
  "animationDelay", "animationIterationCount", "animationDirection",
  "animationFillMode", "animationPlayState",
  // Cursor & interaction
  "cursor", "pointerEvents", "userSelect", "touchAction",
  "scrollBehavior", "scrollMargin", "scrollPadding", "scrollSnapType",
  "scrollSnapAlign", "scrollSnapStop",
  "resize", "appearance",
  // Misc
  "all", "content", "counterIncrement", "counterReset", "counterSet",
  "objectFit", "objectPosition",
  "willChange", "containerType", "containerName", "container",
  "containIntrinsicSize", "contain", "contentVisibility",
  "forcedColorAdjust", "printColorAdjust",
];

/** Per-property completion values. Curated, not exhaustive. */
export const PROPERTY_VALUES: Record<string, string[]> = {
  display: ["flex", "grid", "block", "inline-block", "inline", "inline-flex", "inline-grid", "none", "contents", "flow-root", "table"],
  position: ["relative", "absolute", "fixed", "sticky", "static"],
  overflow: ["hidden", "auto", "scroll", "visible", "clip"],
  overflowX: ["hidden", "auto", "scroll", "visible", "clip"],
  overflowY: ["hidden", "auto", "scroll", "visible", "clip"],
  visibility: ["visible", "hidden", "collapse"],
  flexDirection: ["row", "row-reverse", "column", "column-reverse"],
  flexWrap: ["nowrap", "wrap", "wrap-reverse"],
  alignItems: ["stretch", "flex-start", "flex-end", "center", "baseline", "start", "end", "self-start", "self-end"],
  alignSelf: ["auto", "stretch", "flex-start", "flex-end", "center", "baseline"],
  alignContent: ["stretch", "flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"],
  justifyContent: ["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly", "start", "end"],
  justifyItems: ["start", "end", "center", "stretch", "baseline"],
  justifySelf: ["auto", "start", "end", "center", "stretch"],
  textAlign: ["left", "right", "center", "justify", "start", "end"],
  textTransform: ["none", "uppercase", "lowercase", "capitalize"],
  textDecoration: ["none", "underline", "overline", "line-through"],
  fontStyle: ["normal", "italic", "oblique"],
  fontWeight: ["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold", "lighter", "bolder"],
  whiteSpace: ["normal", "nowrap", "pre", "pre-wrap", "pre-line", "break-spaces"],
  cursor: ["pointer", "default", "text", "wait", "crosshair", "move", "not-allowed", "grab", "grabbing", "help", "progress", "zoom-in", "zoom-out"],
  pointerEvents: ["auto", "none"],
  userSelect: ["none", "auto", "text", "all", "contain"],
  borderStyle: ["solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset", "none", "hidden"],
  boxSizing: ["border-box", "content-box"],
  objectFit: ["contain", "cover", "fill", "none", "scale-down"],
  resize: ["none", "both", "horizontal", "vertical"],
  direction: ["ltr", "rtl"],
  writingMode: ["horizontal-tb", "vertical-rl", "vertical-lr"],
  wordBreak: ["normal", "break-all", "keep-all", "break-word"],
  backgroundRepeat: ["no-repeat", "repeat", "repeat-x", "repeat-y", "round", "space"],
  backgroundPosition: ["center", "top", "bottom", "left", "right"],
  backgroundSize: ["auto", "cover", "contain"],
};

/** Variant keys (compound style modifiers) supported by the compiler. */
export const VARIANT_KEYS: Array<{ name: string; doc: string }> = [
  { name: "_dark",         doc: "Apply when `<html>` carries the `.dark` class." },
  { name: "_hover",        doc: "Apply on hover." },
  { name: "_focus",        doc: "Apply on focus." },
  { name: "_active",       doc: "Apply when the element is active." },
  { name: "_disabled",     doc: "Apply when the element is disabled." },
  { name: "_hoverFocus",   doc: "Apply on hover or focus." },
  { name: "_notDisabled",  doc: "Apply when the element is NOT disabled." },
  { name: "_first",        doc: "Apply to first child." },
  { name: "_last",         doc: "Apply to last child." },
  { name: "_odd",          doc: "Apply to odd children." },
  { name: "_even",         doc: "Apply to even children." },
  { name: "_mobile",       doc: "Apply at small breakpoints." },
  { name: "_tablet",       doc: "Apply at medium breakpoints." },
  { name: "_widescreen",   doc: "Apply at large breakpoints." },
  { name: "_autoDark",     doc: "Set to `false` to skip auto-derived dark variants for this group." },
  { name: "_autoRtl",      doc: "Set to `false` to skip auto-derived logical-property rewrites for this group." },
];
