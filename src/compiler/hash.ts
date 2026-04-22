export function fnv32a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h.toString(36).slice(0, 6);
}
export function toKebab(prop: string): string {
  return prop
    .replace(/([A-Z])/g, m => `-${m.toLowerCase()}`)
    .replace(/^(webkit|moz|ms)/, "-$1");
}
export function classFor(prop: string, value: string, selector?: string): string {
  const key = selector ? `${prop}:${value}:${selector}` : `${prop}:${value}`;
  return `sc${fnv32a(key)}`;
}
