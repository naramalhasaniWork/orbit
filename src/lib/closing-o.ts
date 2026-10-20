/**
 * The Closing O (refined R2). 24-unit grid, circle r 8.5 centred at (12,12), round caps.
 * The gap is the untested remainder; the dot is the agent on its pass.
 */
export type ClosingOState = "idle" | "running" | "passed" | "failed";

export interface ClosingOCut {
  /** Open arc, drawn from the gap's lower end round to its upper end. */
  arc: string;
  stroke: number;
  dot: { cx: number; cy: number; r: number };
  /** Arc length as a share of the circle (pathLength 100). */
  arcPercent: number;
  /** Rotation (deg) that puts a pathLength-100 <circle>'s start at the arc's start. */
  startDeg: number;
}

const DOT_45 = { cx: 18.01, cy: 5.99 };

/** ≥ 24px: 79° gap centred at 45°, clearance one stroke each side, dot r 2.0. */
export const DISPLAY_CUT: ClosingOCut = {
  arc: "M12.815 3.539 A8.5 8.5 0 1 0 20.461 11.185",
  stroke: 2.5,
  dot: { ...DOT_45, r: 2 },
  arcPercent: (281 / 360) * 100,
  startDeg: -5.5,
};

/** < 24px: heavier stroke, 90° gap, so the gap never closes up in a browser tab. */
export const SMALL_CUT: ClosingOCut = {
  arc: "M12 3.5 A8.5 8.5 0 1 0 20.5 12",
  stroke: 3,
  dot: { ...DOT_45, r: 2.5 },
  arcPercent: 75,
  startDeg: 0,
};

export const SMALL_CUT_BELOW_PX = 24;

export function cutForSize(px: number): ClosingOCut {
  return px < SMALL_CUT_BELOW_PX ? SMALL_CUT : DISPLAY_CUT;
}

/** Brand hexes for contexts that cannot read CSS variables (favicons, OG images). */
export const MARK_HEX = {
  ink: "#111316",
  paper: "#FFFFFF",
  live: "#FF5B14",
  liveOnInk: "#FF7A3D",
  pass: "#3DD68C",
  fail: "#FF6B81",
  track: "#343A42",
};

/**
 * Favicon / app tile: ink tile, reversed stroke (−4% for irradiation), state shown in the dot.
 * Static by design: favicons are swapped per state, never animated.
 */
export function markTileSvg(state: ClosingOState, px: number): string {
  const cut = cutForSize(px);
  const stroke = +(cut.stroke * 0.96).toFixed(2);
  let mark: string;
  if (state === "running") {
    // Mid-pass: drawn arc behind the dot, the rest of the track still dim.
    mark =
      `<path d="M12 3.5 A8.5 8.5 0 0 0 3.5 12" fill="none" stroke="${MARK_HEX.paper}" stroke-width="${stroke}" stroke-linecap="round"/>` +
      `<path d="M3.5 12 A8.5 8.5 0 0 0 12 20.5" fill="none" stroke="${MARK_HEX.track}" stroke-width="${stroke}" stroke-linecap="round"/>` +
      `<circle cx="12" cy="20.5" r="${cut.dot.r}" fill="${MARK_HEX.liveOnInk}"/>`;
  } else if (state === "passed") {
    mark = `<circle cx="12" cy="12" r="8.5" fill="none" stroke="${MARK_HEX.pass}" stroke-width="${stroke}"/>`;
  } else {
    const arc = `<path d="${cut.arc}" fill="none" stroke="${MARK_HEX.paper}" stroke-width="${stroke}" stroke-linecap="round"/>`;
    const { cx, cy, r } = cut.dot;
    const dot =
      state === "failed"
        ? `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="0.4" fill="${MARK_HEX.fail}"/>`
        : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${MARK_HEX.liveOnInk}"/>`;
    mark = arc + dot;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${px}" height="${px}"><rect width="24" height="24" rx="5.25" fill="${MARK_HEX.ink}"/><g transform="translate(2.4 2.4) scale(0.8)">${mark}</g></svg>`;
}

export function markTileDataUri(state: ClosingOState, px: number): string {
  return `data:image/svg+xml,${encodeURIComponent(markTileSvg(state, px))}`;
}
