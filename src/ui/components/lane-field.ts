import '../styles/lane-field.css';
import { define, el, svgEl, uid } from './dom.ts';
import { icon } from './icons.ts';

// The brand mark at stage size: lanes crossed by a finish line, with runners that keep going.
// Decorative. Motion is CSS only; a Pause button meets WCAG 2.2.2 and reduced motion shows a still frame.

/** Status and brand hues a runner can take. Lime stays reserved for the finish line. */
export type LaneHue = 'brand' | 'status-ready' | 'positive' | 'warning' | 'danger' | 'status-paused';

/** steady holds one pace; stall stops partway and starts again; surge starts slow and kicks to the line. */
export type LanePace = 'steady' | 'stall' | 'surge';

export interface Runner {
  readonly hue: LaneHue;
  readonly pace: LanePace;
  /** One loop, in seconds. */
  readonly seconds: number;
  /** Where in its loop the runner starts, 0–1, so lanes never move in step. */
  readonly phase: number;
  /** Progress toward the line in the still frame (reduced motion), 0–1. */
  readonly still: number;
}

/** One entry per lane, left to right; null leaves the lane empty. Wide enough to cover a tilted, full-bleed stage. */
export const DEFAULT_RUNNERS: readonly (Runner | null)[] = [
  { hue: 'warning', pace: 'steady', seconds: 13, phase: 0.3, still: 0.6 },
  { hue: 'positive', pace: 'steady', seconds: 12, phase: 0.9, still: 0.74 },
  { hue: 'status-ready', pace: 'steady', seconds: 11, phase: 0.35, still: 0.9 },
  { hue: 'danger', pace: 'surge', seconds: 14, phase: 0.1, still: 0.58 },
  null,
  { hue: 'brand', pace: 'stall', seconds: 13, phase: 0.55, still: 1 },
  { hue: 'warning', pace: 'steady', seconds: 16, phase: 0.8, still: 0.66 },
  { hue: 'status-ready', pace: 'surge', seconds: 17, phase: 0.45, still: 0.42 },
  { hue: 'positive', pace: 'stall', seconds: 12, phase: 0.2, still: 0.84 },
  { hue: 'status-paused', pace: 'surge', seconds: 15, phase: 0.65, still: 0.7 },
  { hue: 'danger', pace: 'steady', seconds: 10, phase: 0.05, still: 0.55 },
  null,
  { hue: 'brand', pace: 'steady', seconds: 14, phase: 0.7, still: 0.8 },
  { hue: 'warning', pace: 'stall', seconds: 15, phase: 0.4, still: 0.5 },
  { hue: 'status-ready', pace: 'steady', seconds: 12, phase: 0.15, still: 0.95 },
  null,
  { hue: 'danger', pace: 'surge', seconds: 13, phase: 0.85, still: 0.62 },
  { hue: 'positive', pace: 'steady', seconds: 11, phase: 0.5, still: 0.7 },
];

// Geometry in viewBox units. The finish line sits a third of the way down, as in the mark.
// The width follows the lane count; lanes bleed 100 past each side so the skew never shows an edge.
const HEIGHT = 900;
const FINISH = 300;
const PITCH = 92;
const LANE = 60;
const RUNNER = 104;
/** How far below the line a runner starts; the CSS keyframes use the same numbers. */
const START = 660;
const TRAIL = START + RUNNER / 2;
const FIRST = -100;

/**
 * <fl-lane-field [paused]> · fills its positioned parent.
 * `paused` holds every runner where it is; the built-in button toggles it.
 * Layouts may size, rotate and paint `.fl-lanefield__plane`, and size the drawing inside it
 * (`.fl-lanefield__svg`, whose dividers run past the viewBox); the button stays upright.
 */
export class LaneField extends HTMLElement {
  static readonly observedAttributes = ['paused'];

  #runners: readonly (Runner | null)[] = DEFAULT_RUNNERS;
  #toggle: HTMLButtonElement | null = null;

  get runners(): readonly (Runner | null)[] {
    return this.#runners;
  }

  set runners(value: readonly (Runner | null)[]) {
    this.#runners = [...value];
    if (this.isConnected) this.render();
  }

  get paused(): boolean {
    return this.hasAttribute('paused');
  }

  set paused(value: boolean) {
    this.toggleAttribute('paused', value);
  }

  connectedCallback(): void {
    this.render();
  }

  attributeChangedCallback(): void {
    this.#paintToggle();
  }

  protected render(): void {
    const toggle = el('button', 'fl-iconbtn fl-lanefield__toggle');
    toggle.type = 'button';
    toggle.addEventListener('click', () => {
      this.paused = !this.paused;
    });
    this.#toggle = toggle;
    this.#paintToggle();
    const plane = el('div', 'fl-lanefield__plane');
    plane.append(drawField(this.#runners));
    this.replaceChildren(plane, toggle);
  }

  #paintToggle(): void {
    const toggle = this.#toggle;
    if (!toggle) return;
    const label = this.paused ? 'Play animation' : 'Pause animation';
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    toggle.replaceChildren(icon(this.paused ? 'resume' : 'pauseCircle'));
  }
}

function drawField(runners: readonly (Runner | null)[]): SVGSVGElement {
  const width = runners.length * PITCH + 2 * FIRST;
  const svg = svgEl('svg', {
    class: 'fl-lanefield__svg',
    viewBox: `0 0 ${width} ${HEIGHT}`,
    preserveAspectRatio: 'xMidYMid slice',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const fieldId = `fl-lanefield-${uid()}`;

  // Skewed about the centre so the lanes lean forward and still cover both edges.
  const track = svgEl('g', { transform: `translate(${width / 2} ${HEIGHT / 2}) skewX(-14) translate(${-width / 2} ${-HEIGHT / 2})` });
  runners.forEach((runner, i) => {
    const x = FIRST + i * PITCH;
    track.append(divider(x));
    if (runner) track.append(drawLane(runner, x + (PITCH - LANE) / 2, `${fieldId}-${i}`));
  });
  const last = FIRST + runners.length * PITCH;
  track.append(
    divider(last),
    svgEl('line', { class: 'fl-lanefield__finish', x1: FIRST - PITCH, y1: FINISH, x2: last + PITCH, y2: FINISH }),
  );
  svg.append(track);
  return svg;
}

/** Runs well past the viewBox so a plane taller than the drawing still shows lanes. */
function divider(x: number): SVGLineElement {
  return svgEl('line', { class: 'fl-lanefield__divider', x1: x, y1: -HEIGHT, x2: x, y2: 3 * HEIGHT });
}

function drawLane(runner: Runner, x: number, trailId: string): SVGGElement {
  const lane = svgEl('g', { class: 'fl-lanefield__lane', 'data-pace': runner.pace });
  if (runner.still >= 1) lane.setAttribute('data-done', '');
  lane.style.setProperty('--lane', `var(--${runner.hue})`);
  lane.style.setProperty('--lane-seconds', `${runner.seconds}s`);
  lane.style.setProperty('--lane-delay', `${-runner.phase * runner.seconds}s`);
  lane.style.setProperty('--lane-still', String(runner.still));
  // Bright at the runner, fading toward the start. Stops take the lane hue through --lane.
  const fade = svgEl('linearGradient', { id: trailId, x1: 0, y1: 0, x2: 0, y2: 1 });
  fade.append(
    svgEl('stop', { class: 'fl-lanefield__stop', offset: 0 }),
    svgEl('stop', { class: 'fl-lanefield__stop', offset: 1, 'stop-opacity': 0 }),
  );
  // The trail's head sits mid-runner: TRAIL × 0.927 = START, so scaling with progress keeps them together.
  lane.append(
    fade,
    svgEl('rect', { class: 'fl-lanefield__trail', x, y: FINISH, width: LANE, height: TRAIL, fill: `url(#${trailId})` }),
    svgEl('rect', { class: 'fl-lanefield__runner', x, y: FINISH, width: LANE, height: RUNNER, rx: LANE / 2 }),
    svgEl('line', { class: 'fl-lanefield__tape', x1: x - 6, y1: FINISH, x2: x + LANE + 6, y2: FINISH }),
  );
  return lane;
}

define('fl-lane-field', LaneField);
