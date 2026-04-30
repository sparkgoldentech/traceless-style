/**
 * ProgressBar — smooth, animated, and driven by a CSS custom property.
 *
 * Demonstrates:
 *   • The ONE legitimate use of style={{}}: setting a CSS custom property
 *     that the static stylesheet reads.
 *   • tl.keyframes for an indeterminate animation
 *   • motionReduce variant for accessibility
 */
import { useEffect } from "react";
import { tl } from "traceless-style";
import { tokens } from "../theme/tokens";

const stripes = tl.keyframes("progressStripes", {
  from: { backgroundPosition:   "0 0" },
  to:   { backgroundPosition: "20px 0" },
});

const $ = tl.create({
  track: {
    width:         "100%",
    height:        "0.5rem",
    background:    tokens.surface.muted,
    borderRadius:  tokens.radius.round,
    overflow:      "hidden",
  },
  bar: {
    height:        "100%",
    width:         "var(--progress, 0%)",        // ← read from custom property
    background:    `linear-gradient(45deg, ${"#3b82f6"} 25%, transparent 25%, transparent 50%, ${"#3b82f6"} 50%, ${"#3b82f6"} 75%, transparent 75%)`,
    backgroundSize: "20px 20px",
    backgroundColor: tokens.brand.primary,
    borderRadius:  tokens.radius.round,
    transition:    "width 200ms ease",
    animation:     `${stripes} 1s linear infinite`,
    motionReduce:  { animation: "none" },
  },
});

export interface ProgressBarProps {
  /** A value 0–100. */
  value: number;
}

export function ProgressBar({ value }: ProgressBarProps) {
  /* Setting a CSS custom property on a host element is the legitimate
     escape hatch for runtime-dynamic values. The lint allows this
     because the key starts with "--". */
  return (
    <div className={$.track}>
      <div
        className={$.bar}
        style={{ ["--progress" as never]: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
