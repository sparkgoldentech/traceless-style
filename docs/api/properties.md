# Property allowlist

`tl.create` accepts only known CSS properties. Unknown keys raise a build error with a Levenshtein-suggested replacement.

```
✗ Unknown CSS property 'colour' — did you mean 'color'?
```

## Accepted property forms

1. **Standard properties** — ~250 entries from `src/compiler/css-properties.ts`. See category list below.
2. **CSS custom properties** — keys matching `--*` (e.g. `--brand-primary: "#3b82f6"`).
3. **Vendor-prefixed properties** — camelCase (`webkitTransform`, `mozAppearance`) or kebab (`-webkit-transform`, `-moz-appearance`).

## Property categories (all from `src/types/css.ts`)

### Layout & display
`display`, `position`, `top`, `right`, `bottom`, `left`, `inset`, `insetInline*`, `insetBlock*`, `zIndex`, `float`, `clear`, `visibility`, `overflow`, `overflowX`, `overflowY`, `overflowWrap`, `overscrollBehavior*`, `clipPath`, `clip`

### Flexbox
`flex`, `flexDirection`, `flexWrap`, `flexFlow`, `flexGrow`, `flexShrink`, `flexBasis`, `justifyContent`, `alignItems`, `alignSelf`, `alignContent`, `gap`, `rowGap`, `columnGap`, `order`, `placeContent`, `placeItems`, `placeSelf`

### Grid
`gridTemplate`, `gridTemplateAreas`, `gridTemplateColumns`, `gridTemplateRows`, `gridArea`, `gridColumn`, `gridColumnStart`, `gridColumnEnd`, `gridRow`, `gridRowStart`, `gridRowEnd`, `gridAutoColumns`, `gridAutoRows`, `gridAutoFlow`, `gridGap`, `gridColumnGap`, `gridRowGap`

### Sizing
`width`, `minWidth`, `maxWidth`, `height`, `minHeight`, `maxHeight`, `inlineSize`, `blockSize`, `aspectRatio`

### Spacing
`margin`, `marginTop`, `marginRight`, `marginBottom`, `marginLeft`, `marginInline*`, `marginBlock*`, `padding`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`, `paddingInline*`, `paddingBlock*`

### Typography
`font`, `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`, `fontVariant`, `fontStretch`, `fontFeatureSettings`, `fontVariationSettings`, `lineHeight`, `letterSpacing`, `wordSpacing`, `textAlign`, `textTransform`, `textDecoration`, `textDecorationColor`, `textDecorationLine`, `textDecorationStyle`, `textDecorationThickness`, `textIndent`, `textShadow`, `textOverflow`, `whiteSpace`, `wordBreak`, `overflowWrap`, `hyphens`, `direction`, `unicodeBidi`, `writingMode`, `verticalAlign`

### Color
`color`, `accentColor`, `caretColor`, `colorScheme`, `backgroundColor`, `borderColor`, `outlineColor`

### Background
`background`, `backgroundImage`, `backgroundPosition`, `backgroundSize`, `backgroundRepeat`, `backgroundAttachment`, `backgroundClip`, `backgroundOrigin`, `backgroundBlendMode`

### Border & outline
`border`, `borderWidth`, `borderStyle`, `borderColor`, `borderRadius`, `borderTop*`, `borderRight*`, `borderBottom*`, `borderLeft*`, `borderInlineStart*`, `borderInlineEnd*`, `borderBlockStart*`, `borderBlockEnd*`, `borderStartStartRadius`, `borderStartEndRadius`, `borderEndStartRadius`, `borderEndEndRadius`, `outline`, `outlineWidth`, `outlineStyle`, `outlineOffset`

### Box-model effects
`boxShadow`, `boxSizing`, `mixBlendMode`, `isolation`, `filter`, `backdropFilter`, `mask*`

### Transform
`transform`, `transformOrigin`, `transformStyle`, `perspective`, `perspectiveOrigin`, `backfaceVisibility`, `translate`, `rotate`, `scale`

### Transition & animation
`transition`, `transitionProperty`, `transitionDuration`, `transitionTimingFunction`, `transitionDelay`, `animation`, `animationName`, `animationDuration`, `animationTimingFunction`, `animationDelay`, `animationIterationCount`, `animationDirection`, `animationFillMode`, `animationPlayState`, `willChange`

### Interaction
`cursor`, `pointerEvents`, `userSelect`, `touchAction`, `appearance`, `resize`, `scrollBehavior`, `scrollSnap*`, `scrollPadding*`, `scrollMargin*`

### SVG
`fill`, `fillOpacity`, `fillRule`, `stroke`, `strokeWidth`, `strokeOpacity`, `strokeLinecap`, `strokeLinejoin`, `strokeMiterlimit`, `strokeDasharray`, `strokeDashoffset`

### Container & view-timeline
`container`, `containerType`, `containerName`, `viewTransitionName`

### Print
`pageBreakBefore`, `pageBreakAfter`, `pageBreakInside`, `breakBefore`, `breakAfter`, `breakInside`, `widows`, `orphans`

### Lists & counters
`listStyle`, `listStyleType`, `listStyleImage`, `listStylePosition`, `counterIncrement`, `counterReset`, `counterSet`

### Tables
`tableLayout`, `borderCollapse`, `borderSpacing`, `captionSide`, `emptyCells`

### Misc
`opacity`, `content`, `quotes`, `objectFit`, `objectPosition`, `imageRendering`

## CSS variables

Any key starting with `--` is accepted:

```ts
tl.create({
  surface: {
    "--brand-primary": "#3b82f6",
    "--shadow-color":  "0 0% 0%",
  },
});
```

## Vendor prefixes

Both forms work:

```ts
tl.create({
  example: {
    webkitTransform:    "translateZ(0)",     // ✓ camelCase
    "-moz-appearance":  "none",              // ✓ kebab
    "-ms-overflow-style": "none",            // ✓
  },
});
```

## Logical properties

Logical properties are first-class — the auto-RTL rewrite produces them, and you can write them yourself:

```ts
tl.create({
  card: {
    paddingInline: "1rem",        // = paddingLeft + paddingRight
    paddingBlock:  "0.5rem",      // = paddingTop + paddingBottom
    marginInlineStart: "auto",    // = marginLeft in LTR, marginRight in RTL
  },
});
```

## Querying the allowlist programmatically

```ts
import { isKnownProperty, listKnownProperties, suggestClosestProperty }
  from "traceless-style/compiler";

isKnownProperty("color");          // true
isKnownProperty("colour");         // false
listKnownProperties();             // string[]
suggestClosestProperty("colour");  // "color"
```

(These are internal compiler exports, not part of the runtime public API.)

## Adding new properties

If a CSS property is missing, open an issue or PR — the allowlist lives in `src/types/css.ts`. The allowlist is intentionally curated rather than `Record<string, any>` to catch typos at build time.
