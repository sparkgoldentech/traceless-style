 /**
 * spark-css — CSS property types
 * Full TypeScript autocomplete for all CSS properties.
 */
export type CSSValue = string | number;

export interface CSSProperties {
  /* Layout */
  display?:          string;
  visibility?:       "visible"|"hidden"|"collapse";
  overflow?:         "hidden"|"auto"|"scroll"|"visible"|"clip";
  overflowX?:        "hidden"|"auto"|"scroll"|"visible";
  overflowY?:        "hidden"|"auto"|"scroll"|"visible";
  position?:         "relative"|"absolute"|"fixed"|"sticky"|"static";
  top?:              CSSValue; bottom?: CSSValue;
  left?:             CSSValue; right?:  CSSValue;
  inset?:            CSSValue; insetBlock?: CSSValue; insetInline?: CSSValue;
  zIndex?:           CSSValue;

  /* Flexbox */
  flexDirection?:    "row"|"column"|"row-reverse"|"column-reverse";
  flexWrap?:         "wrap"|"nowrap"|"wrap-reverse";
  flex?:             CSSValue; flexGrow?: CSSValue; flexShrink?: CSSValue; flexBasis?: CSSValue;
  alignItems?:       "center"|"flex-start"|"flex-end"|"stretch"|"baseline";
  alignSelf?:        "center"|"flex-start"|"flex-end"|"stretch"|"auto";
  alignContent?:     "center"|"flex-start"|"flex-end"|"stretch"|"space-between"|"space-around";
  justifyContent?:   "center"|"flex-start"|"flex-end"|"space-between"|"space-around"|"space-evenly";
  justifyItems?:     "center"|"start"|"end"|"stretch";
  justifySelf?:      "center"|"start"|"end"|"stretch"|"auto";
  gap?:              CSSValue; rowGap?: CSSValue; columnGap?: CSSValue;
  order?:            CSSValue;

  /* Grid */
  gridTemplateColumns?: CSSValue; gridTemplateRows?: CSSValue;
  gridTemplateAreas?:   CSSValue; gridColumn?: CSSValue; gridRow?: CSSValue;
  gridArea?:            CSSValue; gridAutoFlow?: CSSValue;
  gridAutoColumns?:     CSSValue; gridAutoRows?: CSSValue;
  placeItems?:          CSSValue; placeContent?: CSSValue; placeSelf?: CSSValue;

  /* Sizing */
  width?:     CSSValue; height?:    CSSValue;
  minWidth?:  CSSValue; minHeight?: CSSValue;
  maxWidth?:  CSSValue; maxHeight?: CSSValue;
  aspectRatio?: CSSValue; boxSizing?: "border-box"|"content-box";

  /* Spacing */
  padding?:            CSSValue; paddingTop?:         CSSValue;
  paddingBottom?:      CSSValue; paddingLeft?:        CSSValue;
  paddingRight?:       CSSValue; paddingInline?:      CSSValue;
  paddingBlock?:       CSSValue; paddingInlineStart?: CSSValue;
  paddingInlineEnd?:   CSSValue; paddingBlockStart?:  CSSValue;
  paddingBlockEnd?:    CSSValue;
  margin?:             CSSValue; marginTop?:          CSSValue;
  marginBottom?:       CSSValue; marginLeft?:         CSSValue;
  marginRight?:        CSSValue; marginInline?:       CSSValue;
  marginBlock?:        CSSValue; marginInlineStart?:  CSSValue;
  marginInlineEnd?:    CSSValue;

  /* Typography */
  fontFamily?:       CSSValue; fontSize?:       CSSValue;
  fontWeight?:       CSSValue; fontStyle?:      "normal"|"italic"|"oblique";
  lineHeight?:       CSSValue; letterSpacing?:  CSSValue;
  textAlign?:        "left"|"right"|"center"|"justify"|"start"|"end";
  textTransform?:    "uppercase"|"lowercase"|"capitalize"|"none";
  textDecoration?:   CSSValue; textOverflow?:   "ellipsis"|"clip"|CSSValue;
  textIndent?:       CSSValue; textShadow?:     CSSValue;
  whiteSpace?:       "nowrap"|"normal"|"pre"|"pre-wrap"|"pre-line";
  wordBreak?:        "break-word"|"break-all"|"keep-all"|"normal";
  overflowWrap?:     "break-word"|"normal"|"anywhere";
  direction?:        "ltr"|"rtl";

  /* Colors & Background */
  color?:                 CSSValue; backgroundColor?:    CSSValue;
  background?:            CSSValue; backgroundImage?:    CSSValue;
  backgroundSize?:        CSSValue; backgroundPosition?: CSSValue;
  backgroundRepeat?:      CSSValue; backgroundClip?:     CSSValue;
  opacity?:               CSSValue; caretColor?:         CSSValue;

  /* Borders */
  border?:           CSSValue; borderTop?:    CSSValue;
  borderBottom?:     CSSValue; borderLeft?:   CSSValue;
  borderRight?:      CSSValue; borderInline?: CSSValue;
  borderBlock?:      CSSValue; borderWidth?:  CSSValue;
  borderStyle?:      "solid"|"dashed"|"dotted"|"double"|"none";
  borderColor?:      CSSValue; borderRadius?: CSSValue;
  borderTopLeftRadius?:     CSSValue; borderTopRightRadius?:    CSSValue;
  borderBottomLeftRadius?:  CSSValue; borderBottomRightRadius?: CSSValue;
  outline?:          CSSValue; outlineColor?: CSSValue; outlineOffset?: CSSValue;
  boxShadow?:        CSSValue;

  /* Effects */
  filter?:           CSSValue; backdropFilter?: CSSValue;
  mixBlendMode?:     CSSValue; clipPath?:       CSSValue;
  objectFit?:        "cover"|"contain"|"fill"|"none"|"scale-down";
  objectPosition?:   CSSValue;

  /* Transform & Animation */
  transform?:             CSSValue; transformOrigin?: CSSValue;
  translate?:             CSSValue; rotate?:          CSSValue; scale?: CSSValue;
  transition?:            CSSValue; transitionProperty?: CSSValue;
  transitionDuration?:    CSSValue; transitionTimingFunction?: CSSValue;
  transitionDelay?:       CSSValue;
  animation?:             CSSValue; animationName?:      CSSValue;
  animationDuration?:     CSSValue; animationDelay?:     CSSValue;
  animationIterationCount?: CSSValue; animationFillMode?: CSSValue;
  willChange?:            CSSValue;

  /* UI & Interaction */
  cursor?:           "pointer"|"default"|"text"|"not-allowed"|"wait"|"grab"|"grabbing"|"auto"|"none"|CSSValue;
  pointerEvents?:    "none"|"auto"|"all";
  userSelect?:       "none"|"text"|"all"|"auto";
  touchAction?:      "none"|"auto"|"manipulation"|CSSValue;
  resize?:           "none"|"both"|"horizontal"|"vertical";
  appearance?:       "none"|"auto";
  scrollBehavior?:   "smooth"|"auto";

  /* SVG */
  fill?:             CSSValue; stroke?: CSSValue; strokeWidth?: CSSValue;

  /* Custom properties */
  [key: `--${string}`]: CSSValue | undefined;
  [key: string]: CSSValue | undefined;
}