/**
 * traceless-style VS Code extension — cssDocs.ts
 *
 * Per-property short descriptions + MDN URLs surfaced in hover and
 * completion documentation popups. Curated for the most-used properties
 * (~80 entries cover ~95% of typical usage). Properties without an entry
 * still appear in autocomplete; they just lack the rich documentation.
 *
 * Format: `propName` (camelCase) → `{ summary, mdn }`. The MDN URLs use
 * the kebab-case form of the property — that's what MDN uses in URLs.
 */

interface CssPropertyDoc {
  summary: string;
  mdn:     string;
}

function mdn(prop: string): string {
  return `https://developer.mozilla.org/docs/Web/CSS/${prop}`;
}

export const CSS_PROPERTY_DOCS: Record<string, CssPropertyDoc> = {
  /* Layout */
  display:        { summary: "Sets whether an element is treated as a block or inline element, and the layout used for its children (flex, grid, etc.).", mdn: mdn("display") },
  position:       { summary: "Sets how an element is positioned. Values: `static`, `relative`, `absolute`, `fixed`, `sticky`.", mdn: mdn("position") },
  top:            { summary: "Distance between the element's top edge and its containing block (when positioned).", mdn: mdn("top") },
  right:          { summary: "Distance between the element's right edge and its containing block (when positioned).", mdn: mdn("right") },
  bottom:         { summary: "Distance between the element's bottom edge and its containing block (when positioned).", mdn: mdn("bottom") },
  left:           { summary: "Distance between the element's left edge and its containing block (when positioned).", mdn: mdn("left") },
  zIndex:         { summary: "Stack order of a positioned element. Higher values render in front.", mdn: mdn("z-index") },
  insetInlineStart:{summary: "Logical equivalent of `left` (or `right` in RTL). Auto-RTL rewrites `left` to this.", mdn: mdn("inset-inline-start") },
  insetInlineEnd: { summary: "Logical equivalent of `right` (or `left` in RTL). Auto-RTL rewrites `right` to this.", mdn: mdn("inset-inline-end") },

  /* Box */
  width:          { summary: "Sets the element's width.", mdn: mdn("width") },
  height:         { summary: "Sets the element's height.", mdn: mdn("height") },
  minWidth:       { summary: "Minimum width the element can shrink to.", mdn: mdn("min-width") },
  minHeight:      { summary: "Minimum height the element can shrink to.", mdn: mdn("min-height") },
  maxWidth:       { summary: "Maximum width the element can grow to.", mdn: mdn("max-width") },
  maxHeight:      { summary: "Maximum height the element can grow to.", mdn: mdn("max-height") },
  boxSizing:      { summary: "How `width`/`height` are calculated. `border-box` includes padding + border; `content-box` does not (default).", mdn: mdn("box-sizing") },
  aspectRatio:    { summary: "Preferred aspect ratio for the box. Example: `16 / 9`.", mdn: mdn("aspect-ratio") },

  /* Spacing */
  margin:         { summary: "Outer space around the element. Shorthand for marginTop/Right/Bottom/Left.", mdn: mdn("margin") },
  marginTop:      { summary: "Top outer margin.", mdn: mdn("margin-top") },
  marginRight:    { summary: "Right outer margin. Auto-RTL: rewrites to `margin-inline-end`.", mdn: mdn("margin-right") },
  marginBottom:   { summary: "Bottom outer margin.", mdn: mdn("margin-bottom") },
  marginLeft:     { summary: "Left outer margin. Auto-RTL: rewrites to `margin-inline-start`.", mdn: mdn("margin-left") },
  marginInline:   { summary: "Logical inline-axis margin. Equivalent to `marginLeft` + `marginRight` in LTR.", mdn: mdn("margin-inline") },
  marginInlineStart: { summary: "Logical equivalent of `marginLeft` (RTL: `marginRight`).", mdn: mdn("margin-inline-start") },
  marginInlineEnd:   { summary: "Logical equivalent of `marginRight` (RTL: `marginLeft`).", mdn: mdn("margin-inline-end") },
  padding:        { summary: "Inner space inside the element. Shorthand for paddingTop/Right/Bottom/Left.", mdn: mdn("padding") },
  paddingTop:     { summary: "Top inner padding.", mdn: mdn("padding-top") },
  paddingRight:   { summary: "Right inner padding. Auto-RTL: rewrites to `padding-inline-end`.", mdn: mdn("padding-right") },
  paddingBottom:  { summary: "Bottom inner padding.", mdn: mdn("padding-bottom") },
  paddingLeft:    { summary: "Left inner padding. Auto-RTL: rewrites to `padding-inline-start`.", mdn: mdn("padding-left") },
  paddingInline:  { summary: "Logical inline-axis padding (left + right in LTR).", mdn: mdn("padding-inline") },
  paddingInlineStart:{ summary: "Logical equivalent of `paddingLeft` (RTL: `paddingRight`).", mdn: mdn("padding-inline-start") },
  paddingInlineEnd:  { summary: "Logical equivalent of `paddingRight` (RTL: `paddingLeft`).", mdn: mdn("padding-inline-end") },
  gap:            { summary: "Gap between rows and columns in flex/grid layouts.", mdn: mdn("gap") },
  rowGap:         { summary: "Gap between rows in flex/grid layouts.", mdn: mdn("row-gap") },
  columnGap:      { summary: "Gap between columns in flex/grid layouts.", mdn: mdn("column-gap") },

  /* Border */
  border:         { summary: "Shorthand: width, style, and color of all four borders.", mdn: mdn("border") },
  borderRadius:   { summary: "Rounds the corners of the element.", mdn: mdn("border-radius") },
  borderTopLeftRadius:    { summary: "Top-left corner radius. Auto-RTL: rewrites to `border-start-start-radius`.", mdn: mdn("border-top-left-radius") },
  borderTopRightRadius:   { summary: "Top-right corner radius. Auto-RTL: rewrites to `border-start-end-radius`.", mdn: mdn("border-top-right-radius") },
  borderBottomLeftRadius: { summary: "Bottom-left corner radius. Auto-RTL: rewrites to `border-end-start-radius`.", mdn: mdn("border-bottom-left-radius") },
  borderBottomRightRadius:{ summary: "Bottom-right corner radius. Auto-RTL: rewrites to `border-end-end-radius`.", mdn: mdn("border-bottom-right-radius") },
  borderColor:    { summary: "Color of all four borders.", mdn: mdn("border-color") },
  borderStyle:    { summary: "Line style of all four borders. Common values: `solid`, `dashed`, `dotted`.", mdn: mdn("border-style") },
  borderWidth:    { summary: "Width of all four borders.", mdn: mdn("border-width") },
  outline:        { summary: "Line drawn outside the border (doesn't take up layout space).", mdn: mdn("outline") },

  /* Background */
  background:     { summary: "Shorthand for setting all background-* properties.", mdn: mdn("background") },
  backgroundColor:{ summary: "Background color of the element.", mdn: mdn("background-color") },
  backgroundImage:{ summary: "Background image (or gradient).", mdn: mdn("background-image") },
  backgroundSize: { summary: "Sizing for the background image. `cover`, `contain`, or specific length.", mdn: mdn("background-size") },
  backgroundRepeat:{summary: "Whether the background image repeats. `no-repeat`, `repeat`, etc.", mdn: mdn("background-repeat") },
  backgroundPosition:{ summary: "Initial position of the background image.", mdn: mdn("background-position") },

  /* Color & text */
  color:          { summary: "Foreground (text) color.", mdn: mdn("color") },
  fontFamily:     { summary: "Font face stack.", mdn: mdn("font-family") },
  fontSize:       { summary: "Font size.", mdn: mdn("font-size") },
  fontWeight:     { summary: "Font weight. `400` = normal, `700` = bold.", mdn: mdn("font-weight") },
  fontStyle:      { summary: "Font style. `normal`, `italic`, `oblique`.", mdn: mdn("font-style") },
  lineHeight:     { summary: "Line box height. Unitless multipliers (e.g. `1.5`) are recommended.", mdn: mdn("line-height") },
  letterSpacing:  { summary: "Tracking — extra space between characters.", mdn: mdn("letter-spacing") },
  textAlign:      { summary: "Horizontal alignment of inline content. `left`, `right`, `center`, `justify`, `start`, `end`. Auto-RTL: maps `left` → `start`, `right` → `end`.", mdn: mdn("text-align") },
  textTransform:  { summary: "Capitalization. `uppercase`, `lowercase`, `capitalize`.", mdn: mdn("text-transform") },
  textDecoration: { summary: "Underline / overline / line-through and its style.", mdn: mdn("text-decoration") },
  whiteSpace:     { summary: "How whitespace is handled. `nowrap` prevents line breaks.", mdn: mdn("white-space") },
  wordBreak:      { summary: "Where the browser may insert line breaks within words.", mdn: mdn("word-break") },
  textOverflow:   { summary: "What to render when text overflows. Common: `ellipsis`.", mdn: mdn("text-overflow") },

  /* Flexbox */
  flex:           { summary: "Shorthand for flex-grow, flex-shrink, flex-basis.", mdn: mdn("flex") },
  flexDirection:  { summary: "Axis of the flex container's main axis.", mdn: mdn("flex-direction") },
  flexWrap:       { summary: "Whether flex items wrap onto multiple lines.", mdn: mdn("flex-wrap") },
  flexGrow:       { summary: "How much a flex item should grow relative to siblings.", mdn: mdn("flex-grow") },
  flexShrink:     { summary: "How much a flex item should shrink relative to siblings.", mdn: mdn("flex-shrink") },
  flexBasis:      { summary: "Initial main-size of a flex item before grow/shrink.", mdn: mdn("flex-basis") },
  alignItems:     { summary: "Cross-axis alignment of flex/grid children.", mdn: mdn("align-items") },
  alignSelf:      { summary: "Override `alignItems` for a single flex/grid child.", mdn: mdn("align-self") },
  alignContent:   { summary: "Distribution of cross-axis space when there's wrap.", mdn: mdn("align-content") },
  justifyContent: { summary: "Main-axis alignment of flex children / grid tracks.", mdn: mdn("justify-content") },
  justifyItems:   { summary: "Default justify-self for grid items.", mdn: mdn("justify-items") },
  justifySelf:    { summary: "Override justifyItems for one grid item.", mdn: mdn("justify-self") },
  order:          { summary: "Visual order of a flex/grid item.", mdn: mdn("order") },

  /* Grid */
  gridTemplateColumns:{ summary: "Defines the column tracks of a grid.", mdn: mdn("grid-template-columns") },
  gridTemplateRows:   { summary: "Defines the row tracks of a grid.", mdn: mdn("grid-template-rows") },
  gridTemplateAreas:  { summary: "Names grid areas for use in `gridArea`.", mdn: mdn("grid-template-areas") },
  gridArea:           { summary: "Places an item by area name (or row/column shorthand).", mdn: mdn("grid-area") },
  gridColumn:         { summary: "Column placement shorthand. Example: `1 / 3`.", mdn: mdn("grid-column") },
  gridRow:            { summary: "Row placement shorthand.", mdn: mdn("grid-row") },

  /* Effects */
  opacity:        { summary: "Element opacity 0–1.", mdn: mdn("opacity") },
  boxShadow:      { summary: "Drop shadow(s). Multiple shadows separated by commas.", mdn: mdn("box-shadow") },
  filter:         { summary: "Visual effects (blur, brightness, etc.) applied to the element.", mdn: mdn("filter") },
  backdropFilter: { summary: "Like `filter`, but applied to the area BEHIND the element (frosted glass).", mdn: mdn("backdrop-filter") },
  mixBlendMode:   { summary: "How the element's content blends with what's behind it.", mdn: mdn("mix-blend-mode") },

  /* Transform */
  transform:      { summary: "2D/3D transformation (translate, rotate, scale, skew).", mdn: mdn("transform") },
  transformOrigin:{ summary: "Origin point for `transform`. Default: `50% 50%` (center).", mdn: mdn("transform-origin") },
  rotate:         { summary: "Standalone rotation. Equivalent to `transform: rotate(…)`.", mdn: mdn("rotate") },
  scale:          { summary: "Standalone scale. Equivalent to `transform: scale(…)`.", mdn: mdn("scale") },
  translate:      { summary: "Standalone translate. Equivalent to `transform: translate(…)`.", mdn: mdn("translate") },

  /* Transitions / animations */
  transition:     { summary: "Shorthand for transition properties.", mdn: mdn("transition") },
  transitionDuration:{ summary: "Time the transition takes (e.g. `0.2s`).", mdn: mdn("transition-duration") },
  transitionTimingFunction:{summary: "Easing curve. `ease`, `linear`, `ease-in-out`, `cubic-bezier(…)`.", mdn: mdn("transition-timing-function") },
  transitionDelay:{ summary: "Delay before transition starts.", mdn: mdn("transition-delay") },
  transitionProperty:{summary: "Which CSS properties transition. `all`, `none`, or specific names.", mdn: mdn("transition-property") },
  animation:      { summary: "Shorthand for keyframe animations.", mdn: mdn("animation") },
  animationName:  { summary: "Name of the `@keyframes` rule to apply.", mdn: mdn("animation-name") },
  animationDuration:{ summary: "Time one cycle of the animation takes.", mdn: mdn("animation-duration") },

  /* Misc */
  cursor:         { summary: "Mouse cursor when hovering the element.", mdn: mdn("cursor") },
  pointerEvents:  { summary: "Whether the element responds to pointer events. `none` makes it click-through.", mdn: mdn("pointer-events") },
  userSelect:     { summary: "Whether the user can select text in the element.", mdn: mdn("user-select") },
  overflow:       { summary: "What happens when content exceeds the box. `hidden`, `auto`, `scroll`, `visible`.", mdn: mdn("overflow") },
  visibility:     { summary: "Show/hide without removing from layout. Use `display: none` to remove.", mdn: mdn("visibility") },
  objectFit:      { summary: "How a replaced element (img/video) fits its box.", mdn: mdn("object-fit") },
  willChange:     { summary: "Hint to the browser about properties expected to change. Use sparingly.", mdn: mdn("will-change") },
};
