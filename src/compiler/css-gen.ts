export interface AtomicRule {
  cls:       string;
  prop:      string;
  value:     string;
  selector?: string;
  order:     number;
}

export function generateCSS(rules: AtomicRule[]): string {
  return [...rules]
    .sort((a, b) => a.order - b.order)
    .map(r => {
      const d = `${r.prop}:${r.value}`;
      if (!r.selector)                return `.${r.cls}{${d}}`;
      if (r.selector.startsWith("@")) return `${r.selector}{.${r.cls}{${d}}}`;
      if (r.selector.includes("&"))   return `${r.selector.replace(/&/g, `.${r.cls}`)}{${d}}`;
      return `.${r.cls}${r.selector}{${d}}`;
    })
    .join("");
}

export function generateCSSPretty(rules: AtomicRule[]): string {
  const lines = ["/* spark-css — generated */\n"];
  [...rules].sort((a, b) => a.order - b.order).forEach(r => {
    const d = `  ${r.prop}: ${r.value};`;
    if (!r.selector)                lines.push(`.${r.cls} {\n${d}\n}\n`);
    else if (r.selector.startsWith("@")) lines.push(`${r.selector} {\n  .${r.cls} {\n  ${d}\n  }\n}\n`);
    else if (r.selector.includes("&"))   lines.push(`${r.selector.replace(/&/g,`.${r.cls}`)} {\n${d}\n}\n`);
    else                            lines.push(`.${r.cls}${r.selector} {\n${d}\n}\n`);
  });
  return lines.join("");
}

export function buildClassMeta(rules: AtomicRule[]): Record<string, string> {
  const m: Record<string, string> = {};
  rules.forEach(r => { m[r.cls] = r.selector ? `${r.prop}:${r.selector}` : r.prop; });
  return m;
}
