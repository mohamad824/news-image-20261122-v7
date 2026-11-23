// news-image-20261122 v7 — "Sunday 22 November 2026" early edition.
// Broadsheet front page rendered entirely in code: Liberation Serif glyphs
// rasterised from the real TTF files in ./fonts, original code-drawn art.
// Deterministic: no clock, no randomness, no network. Writes one PNG.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
const CREAM: [number, number, number] = [246, 238, 216];
const PAPER: [number, number, number] = [250, 244, 226];
const INK: [number, number, number] = [22, 18, 14];
const RED: [number, number, number] = [164, 22, 33];
const RED_DK: [number, number, number] = [133, 15, 25];
const NAVY: [number, number, number] = [20, 38, 74];
const NAVY_LT: [number, number, number] = [38, 58, 96];
const GOLD: [number, number, number] = [200, 155, 60];
const GOLD_LT: [number, number, number] = [224, 186, 92];
const LAND: [number, number, number] = [214, 192, 146];
const LAND_DK: [number, number, number] = [196, 172, 124];
const SEA: [number, number, number] = [233, 224, 196];
const GREY: [number, number, number] = [96, 88, 76];
const RULE: [number, number, number] = [60, 50, 38];

// ---------------------------------------------------------------- canvas
const px = new Uint8Array(W * H * 3);
function fillAll(c: [number, number, number]): void {
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2];
  }
}
function setPx(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function blendPx(x: number, y: number, c: [number, number, number], a: number): void {
  if (a <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  if (a >= 1) { px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; return; }
  px[i] = Math.round(px[i] * (1 - a) + c[0] * a);
  px[i + 1] = Math.round(px[i + 1] * (1 - a) + c[1] * a);
  px[i + 2] = Math.round(px[i + 2] * (1 - a) + c[2] * a);
}
function rect(x: number, y: number, w: number, h: number, c: [number, number, number]): void {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
}
function hline(x: number, y: number, w: number, c: [number, number, number], t = 1): void {
  rect(x, y, w, t, c);
}
function vline(x: number, y: number, h: number, c: [number, number, number], t = 1): void {
  rect(x, y, t, h, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: [number, number, number], t = 1): void {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + (dx * i) / steps);
    const y = Math.round(y0 + (dy * i) / steps);
    if (t <= 1) setPx(x, y, c);
    else rect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
  }
}
function circle(cx: number, cy: number, r: number, c: [number, number, number]): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = (x - cx + 0.5) * (x - cx + 0.5) + (y - cy + 0.5) * (y - cy + 0.5);
      if (d <= r * r) setPx(x, y, c);
    }
}
function circleOutline(cx: number, cy: number, r: number, c: [number, number, number], t = 1): void {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    const x = Math.round(cx + Math.cos(rad) * r);
    const y = Math.round(cy + Math.sin(rad) * r);
    if (t <= 1) setPx(x, y, c); else rect(x - 1, y - 1, t, t, c);
  }
}
// Even-odd scanline polygon fill (points in canvas coords).
function polyFill(pts: Array<[number, number]>, c: [number, number, number]): void {
  if (pts.length < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(H - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
        xs.push(a[0] + ((cy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) setPx(x, y, c);
    }
  }
}
function polyStroke(pts: Array<[number, number]>, c: [number, number, number], t = 1): void {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    line(a[0], a[1], b[0], b[1], c, t);
  }
}

// ---------------------------------------------------------------- TrueType
type GlyphOutline = Array<Array<[number, number]>>; // contours, font units, y up
interface FontFace {
  upm: number;
  cmap: Map<number, number>;
  advances: number[];
  numGlyphs: number;
  loca: number[];
  glyf: Buffer;
  indexToLocFormat: number;
  cache: Map<string, GlyphBitmap>;
}
interface GlyphBitmap {
  w: number; h: number; bx: number; by: number; adv: number;
  data: Uint8Array; // coverage 0..255
}
function u16(b: Buffer, o: number): number { return b.readUInt16BE(o); }
function i16(b: Buffer, o: number): number { return b.readInt16BE(o); }
function u32(b: Buffer, o: number): number { return b.readUInt32BE(o); }

function loadFont(path: string): FontFace {
  const b = readFileSync(path);
  const numTables = u16(b, 4);
  const tables = new Map<string, number>();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables.set(b.toString("ascii", o, o + 4), u32(b, o + 8));
  }
  const head = tables.get("head")!;
  const upm = u16(b, head + 18);
  const indexToLocFormat = i16(b, head + 50);
  const maxp = tables.get("maxp")!;
  const numGlyphs = u16(b, maxp + 4);
  const hhea = tables.get("hhea")!;
  const numHMetrics = u16(b, hhea + 34);
  const hmtx = tables.get("hmtx")!;
  const advances: number[] = [];
  for (let i = 0; i < numGlyphs; i++) {
    advances.push(i < numHMetrics ? u16(b, hmtx + i * 4) : u16(b, hmtx + (numHMetrics - 1) * 4));
  }
  const locaT = tables.get("loca")!;
  const loca: number[] = [];
  for (let i = 0; i <= numGlyphs; i++) {
    loca.push(indexToLocFormat === 1 ? u32(b, locaT + i * 4) : u16(b, locaT + i * 2) * 2);
  }
  const glyf = b.subarray(tables.get("glyf")!);
  // cmap format 4
  const cmapT = tables.get("cmap")!;
  const nSub = u16(b, cmapT + 2);
  let fmt4 = -1;
  for (let i = 0; i < nSub; i++) {
    const plat = u16(b, cmapT + 4 + i * 8);
    const enc = u16(b, cmapT + 6 + i * 8);
    const off = u32(b, cmapT + 8 + i * 8);
    if (u16(b, cmapT + off) === 4 && plat === 3 && enc === 1) { fmt4 = cmapT + off; break; }
    if (fmt4 < 0 && u16(b, cmapT + off) === 4) fmt4 = cmapT + off;
  }
  const cmap = new Map<number, number>();
  if (fmt4 >= 0) {
    const segCount = u16(b, fmt4 + 6) / 2;
    const endBase = fmt4 + 14;
    const startBase = endBase + segCount * 2 + 2;
    const deltaBase = startBase + segCount * 2;
    const rangeBase = deltaBase + segCount * 2;
    for (let s = 0; s < segCount; s++) {
      const end = u16(b, endBase + s * 2);
      const start = u16(b, startBase + s * 2);
      const delta = i16(b, deltaBase + s * 2);
      const rangeOff = u16(b, rangeBase + s * 2);
      for (let cp = start; cp <= end && cp < 0xffff; cp++) {
        let g = 0;
        if (rangeOff === 0) g = (cp + delta) & 0xffff;
        else {
          const gi = rangeBase + s * 2 + rangeOff + (cp - start) * 2;
          g = u16(b, gi);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g !== 0) cmap.set(cp, g);
      }
    }
  }
  return { upm, cmap, advances, numGlyphs, loca, glyf, indexToLocFormat, cache: new Map() };
}

function glyphContours(f: FontFace, gid: number, depth: number): GlyphOutline {
  if (gid >= f.numGlyphs || depth > 4) return [];
  const o0 = f.loca[gid], o1 = f.loca[gid + 1];
  if (o1 <= o0) return [];
  const g = f.glyf.subarray(o0, o1);
  const nContours = i16(g, 0);
  if (nContours >= 0) {
    const endPts = (i: number) => u16(g, 10 + i * 2);
    let p = 10 + nContours * 2;
    const instrLen = u16(g, p); p += 2 + instrLen;
    const nPts = endPts(nContours - 1) + 1;
    const flags: number[] = [];
    let i = 0;
    while (i < nPts) {
      const fl = g[p++];
      flags.push(fl);
      if (fl & 8) { const rep = g[p++]; for (let k = 0; k < rep; k++) flags.push(fl); i += rep + 1; }
      else i++;
    }
    const xs: number[] = []; const ys: number[] = [];
    let x = 0;
    for (let k = 0; k < nPts; k++) {
      const fl = flags[k];
      if (fl & 2) { const d = g[p++]; x += fl & 16 ? d : -d; }
      else if (!(fl & 16)) { x += i16(g, p); p += 2; }
      xs.push(x);
    }
    let y = 0;
    for (let k = 0; k < nPts; k++) {
      const fl = flags[k];
      if (fl & 4) { const d = g[p++]; y += fl & 32 ? d : -d; }
      else if (!(fl & 32)) { y += i16(g, p); p += 2; }
      ys.push(y);
    }
    const contours: GlyphOutline = [];
    let start = 0;
    for (let c = 0; c < nContours; c++) {
      const end = endPts(c);
      const pts: Array<[number, number, boolean]> = [];
      for (let k = start; k <= end; k++) pts.push([xs[k], ys[k], (flags[k] & 1) !== 0]);
      contours.push(flattenContour(pts));
      start = end + 1;
    }
    return contours;
  }
  // composite glyph
  let p = 10;
  const out: GlyphOutline = [];
  for (;;) {
    const flags = u16(g, p); const compGid = u16(g, p + 2); p += 4;
    let dx = 0, dy = 0;
    if (flags & 1) { dx = i16(g, p); dy = i16(g, p + 2); p += 4; }
    else { dx = g[p]; dy = g[p + 1]; p += 2; if (!(flags & 2)) { dx = 0; dy = 0; } }
    let sx = 1, sy = 1, s01 = 0, s10 = 0;
    if (flags & 8) { sx = sy = i16(g, p) / 16384; p += 2; }
    else if (flags & 0x40) { sx = i16(g, p) / 16384; sy = i16(g, p + 2) / 16384; p += 4; }
    else if (flags & 0x80) {
      sx = i16(g, p) / 16384; s01 = i16(g, p + 2) / 16384;
      s10 = i16(g, p + 4) / 16384; sy = i16(g, p + 6) / 16384; p += 8;
    }
    const sub = glyphContours(f, compGid, depth + 1);
    for (const cont of sub) {
      out.push(cont.map(([cx, cy]): [number, number] => [
        cx * sx + cy * s10 + dx,
        cx * s01 + cy * sy + dy,
      ]));
    }
    if (!(flags & 0x20)) break;
  }
  return out;
}

// Flatten one contour (points with on-curve flags) into polyline, y up.
function flattenContour(pts: Array<[number, number, boolean]>): Array<[number, number]> {
  const n = pts.length;
  if (n === 0) return [];
  const seq: Array<[number, number, boolean]> = [];
  // start at an on-curve point; if none, use midpoint of first two
  let startIdx = -1;
  for (let i = 0; i < n; i++) if (pts[i][2]) { startIdx = i; break; }
  if (startIdx < 0) {
    const mx = (pts[0][0] + pts[n - 1][0]) / 2, my = (pts[0][1] + pts[n - 1][1]) / 2;
    seq.push([mx, my, true]);
    for (let i = 0; i < n; i++) seq.push(pts[i]);
    seq.push([mx, my, true]);
  } else {
    for (let i = 0; i < n; i++) seq.push(pts[(startIdx + i) % n]);
    seq.push(pts[startIdx]);
  }
  const out: Array<[number, number]> = [];
  out.push([seq[0][0], seq[0][1]]);
  let i = 1;
  while (i < seq.length) {
    const cur = seq[i];
    if (cur[2]) { out.push([cur[0], cur[1]]); i++; continue; }
    // off-curve control point; next point is on-curve or another off-curve
    const nxt = seq[i + 1];
    if (nxt && !nxt[2]) {
      const mx = (cur[0] + nxt[0]) / 2, my = (cur[1] + nxt[1]) / 2;
      quad(out, out[out.length - 1], [cur[0], cur[1]], [mx, my]);
      i++;
    } else if (nxt) {
      quad(out, out[out.length - 1], [cur[0], cur[1]], [nxt[0], nxt[1]]);
      i += 2;
    } else i++;
  }
  return out;
}
function quad(out: Array<[number, number]>, p0: [number, number], p1: [number, number], p2: [number, number]): void {
  const d = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
  const steps = Math.max(2, Math.min(24, Math.ceil(d / 28)));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const mt = 1 - t;
    out.push([
      mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
      mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
    ]);
  }
}

const SS = 3; // supersample factor for glyph rasterisation
function rasterGlyph(f: FontFace, code: number, size: number): GlyphBitmap {
  const key = `${code}@${size}`;
  const hit = f.cache.get(key);
  if (hit) return hit;
  const gid = f.cmap.get(code) ?? 0;
  const scale = size / f.upm;
  const adv = (f.advances[gid] ?? 0) * scale;
  const contours = glyphContours(f, gid, 0);
  if (contours.length === 0) {
    const empty: GlyphBitmap = { w: 0, h: 0, bx: 0, by: 0, adv, data: new Uint8Array(0) };
    f.cache.set(key, empty);
    return empty;
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of contours) for (const p of c) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  const bx = Math.floor(minX * scale), by = Math.floor(minY * scale);
  const bw = Math.max(1, Math.ceil(maxX * scale) - bx + 1);
  const bh = Math.max(1, Math.ceil(maxY * scale) - by + 1);
  // supersampled coverage grid
  const sw = bw * SS, sh = bh * SS;
  const cov = new Uint8Array(sw * sh);
  const sContours = contours.map((c) =>
    c.map(([x, y]): [number, number] => [(x * scale - bx) * SS, (sh - 1 - (y * scale - by) * SS)])
  );
  for (let y = 0; y < sh; y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (const c of sContours) {
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length];
        if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
          xs.push(a[0] + ((cy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(sw - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) cov[y * sw + x] = 1;
    }
  }
  const data = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      let sum = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) sum += cov[(y * SS + sy) * sw + x * SS + sx];
      data[y * bw + x] = Math.round((sum / (SS * SS)) * 255);
    }
  }
  const gb: GlyphBitmap = { w: bw, h: bh, bx, by, adv, data };
  f.cache.set(key, gb);
  return gb;
}

function textWidth(f: FontFace, size: number, s: string): number {
  let w = 0;
  for (const ch of s) w += rasterGlyph(f, ch.codePointAt(0)!, size).adv;
  return w;
}
function drawText(f: FontFace, size: number, x: number, baselineY: number, s: string, c: [number, number, number]): number {
  let cx = x;
  for (const ch of s) {
    const g = rasterGlyph(f, ch.codePointAt(0)!, size);
    if (g.w > 0) {
      const top = Math.round(baselineY - g.by - g.h);
      for (let gy = 0; gy < g.h; gy++) {
        for (let gx = 0; gx < g.w; gx++) {
          const a = g.data[gy * g.w + gx];
          if (a) blendPx(Math.round(cx) + g.bx + gx, top + gy, c, a / 255);
        }
      }
    }
    cx += g.adv;
  }
  return cx;
}
function wrapLines(f: FontFace, size: number, s: string, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textWidth(f, size, trial) <= maxW || !cur) cur = trial;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawPara(f: FontFace, size: number, lh: number, x: number, y: number, maxW: number, s: string, c: [number, number, number], maxLines = 99): number {
  const lines = wrapLines(f, size, s, maxW).slice(0, maxLines);
  let yy = y;
  for (const ln of lines) { drawText(f, size, x, yy + size * 0.82, ln, c); yy += lh; }
  return yy;
}
function centerText(f: FontFace, size: number, cx: number, baselineY: number, s: string, c: [number, number, number]): void {
  drawText(f, size, cx - textWidth(f, size, s) / 2, baselineY, s, c);
}

// ---------------------------------------------------------------- world map
// Simplified continent outlines, lon/lat. Drawn from general geography;
// pin positions use the same projection and were checked against each story.
type LL = [number, number];
const NA: LL[] = [[-168,66],[-162,58],[-155,58],[-150,61],[-141,60],[-134,56],[-128,51],[-124,48],[-124,40],[-121,35],[-116,29],[-111,24],[-107,23],[-102,18],[-97,16],[-93,15],[-88,14],[-84,11],[-80,9],[-78,8],[-81,13],[-84,16],[-87,21],[-90,21],[-91,19],[-96,19],[-97,26],[-93,30],[-89,30],[-84,30],[-81,26],[-80,32],[-76,35],[-74,40],[-70,42],[-66,45],[-60,47],[-55,47],[-60,52],[-64,58],[-68,58],[-72,62],[-78,62],[-85,66],[-92,66],[-95,69],[-110,68],[-125,70],[-140,70],[-155,71],[-165,68]];
const SA: LL[] = [[-78,8],[-75,11],[-72,12],[-64,11],[-60,9],[-54,6],[-51,4],[-50,0],[-44,-3],[-38,-5],[-35,-8],[-38,-13],[-40,-20],[-41,-23],[-48,-27],[-52,-33],[-57,-38],[-62,-41],[-65,-45],[-67,-50],[-68,-54],[-71,-54],[-73,-50],[-73,-44],[-73,-37],[-71,-30],[-70,-20],[-75,-15],[-79,-8],[-81,-5],[-80,-1],[-79,4],[-77,7]];
const AF: LL[] = [[-17,15],[-17,21],[-15,27],[-10,31],[-5,35],[0,36],[10,37],[11,34],[19,33],[25,32],[30,31],[32,31],[34,28],[35,24],[37,22],[39,21],[43,12],[46,11],[51,11],[50,7],[47,4],[45,1],[42,-2],[40,-5],[40,-12],[36,-18],[33,-26],[28,-33],[20,-35],[17,-32],[15,-27],[12,-18],[13,-10],[9,-1],[9,4],[-2,5],[-8,5],[-13,8],[-17,12]];
const EU: LL[] = [[-10,36],[-9,43],[-2,48],[-4,49],[0,50],[2,51],[5,53],[8,57],[10,59],[5,60],[5,62],[10,64],[12,66],[18,69],[25,71],[30,70],[35,68],[40,68],[45,68],[55,69],[65,69],[70,72],[75,73],[80,73],[90,75],[100,77],[110,74],[120,73],[130,72],[140,72],[150,70],[160,70],[170,67],[178,65],[178,62],[170,60],[162,60],[158,53],[156,51],[150,59],[142,55],[140,50],[135,44],[130,42],[127,40],[126,38],[122,39],[120,35],[122,32],[120,28],[118,25],[110,21],[108,18],[105,9],[103,7],[100,8],[98,10],[95,16],[92,21],[90,22],[88,22],[86,20],[82,17],[80,13],[77,8],[75,11],[73,16],[70,21],[66,25],[62,25],[58,25],[56,27],[52,26],[50,29],[48,30],[50,26],[54,24],[56,22],[58,20],[55,17],[52,15],[48,14],[44,13],[42,15],[40,15],[39,21],[37,22],[35,24],[34,28],[32,31],[30,32],[27,37],[26,38],[23,36],[22,37],[19,40],[18,40],[15,44],[12,44],[10,44],[8,44],[6,43],[3,43],[0,40],[-2,37],[-6,36],[-9,37]];
const UK: LL[] = [[-5,50],[-3,53],[-5,56],[-3,58],[-1,57],[0,53],[1,51],[-3,50]];
const JP: LL[] = [[130,31],[132,33],[135,34],[137,35],[139,35],[140,38],[141,41],[142,44],[144,44],[142,42],[140,39],[138,37],[136,35],[133,34],[131,33]];
const BORNEO: LL[] = [[109,1],[111,3],[114,4],[117,6],[119,1],[117,-2],[114,-3],[110,-3],[109,0]];
const SUMATRA: LL[] = [[95,5],[98,3],[100,0],[103,-3],[105,-5],[104,-6],[101,-2],[97,3]];
const NGUINEA: LL[] = [[131,-1],[136,-2],[141,-3],[146,-6],[150,-9],[147,-9],[142,-8],[138,-7],[134,-4],[131,-2]];
const AU: LL[] = [[113,-22],[114,-30],[115,-33],[118,-35],[124,-33],[129,-32],[132,-32],[135,-35],[138,-35],[140,-38],[145,-38],[150,-37],[153,-32],[153,-27],[150,-23],[146,-19],[142,-15],[142,-11],[139,-17],[136,-15],[135,-12],[132,-12],[130,-13],[126,-14],[122,-17],[118,-20],[114,-22]];
const NZ: LL[] = [[167,-45],[170,-42],[173,-40],[176,-38],[178,-38],[175,-40],[172,-43],[169,-46]];
const MDG: LL[] = [[44,-16],[47,-15],[50,-16],[49,-20],[47,-24],[45,-25],[43,-22],[43,-17]];
const CONTINENTS: LL[][] = [NA, SA, AF, EU, UK, JP, BORNEO, SUMATRA, NGUINEA, AU, NZ, MDG];

// Pins: [storyNo, lat, lon, label] — coordinates checked against each story.
const PINS: Array<[number, number, number, string]> = [
  [1, 36.9, 30.7, "ANTALYA"],
  [2, 59.8, 24.5, "GULF OF FINLAND"],
  [3, -12.0, -77.0, "PERU"],
  [4, 31.8, 35.2, "JERUSALEM"],
  [5, 47.9, 33.4, "KRYVYI RIH"],
  [6, 24.8, -107.4, "SINALOA"],
  [7, 26.2, 50.6, "BAHRAIN"],
  [8, 2.0, 45.3, "MOGADISHU"],
  [9, 31.5, 34.5, "GAZA"],
  [10, 38.9, -77.0, "USA"],
  [11, 36.2, -115.1, "LAS VEGAS"],
  [12, 51.5, -0.3, "TWICKENHAM"],
  [13, 55.0, -1.6, "NEWCASTLE"],
];

// ---------------------------------------------------------------- fonts
const HERE = dirname(fileURLToPath(import.meta.url));
const REG = loadFont(join(HERE, "fonts", "LiberationSerif-Regular.ttf"));
const BOLD = loadFont(join(HERE, "fonts", "LiberationSerif-Bold.ttf"));
const ITAL = loadFont(join(HERE, "fonts", "LiberationSerif-Italic.ttf"));

// ---------------------------------------------------------------- content
interface Lead { n: number; kicker: string; cert: string; head: string; body: string; }
const LEADS: Lead[] = [
  { n: 1, kicker: "ANTALYA, TURKEY — CLIMATE", cert: "REPORTED",
    head: "COP31 climate talks close in on a final deal",
    body: "A new package was unveiled at a late-night plenary; objections were due by 03:00 GMT and approval is set for Sunday morning. Fossil fuels and finance remain the sticking points. (Reuters)" },
  { n: 2, kicker: "GULF OF FINLAND — WAR AT SEA", cert: "REPORTED",
    head: "Russian cargo ship ablaze after drone strike",
    body: "The sanctioned Sparta II, linked to Russia's Defence Ministry, was hit by a suspected Ukrainian drone; the fire burned out of control overnight. (AP, Finnish Border Guard)" },
  { n: 3, kicker: "PERU — EARTHQUAKE", cert: "REPORTED",
    head: "Magnitude 6.8 quake shakes Peru's Andes",
    body: "The tremor sent people in Lima fleeing from their homes. First reports brought no word of damage or casualties. (Wire reports)" },
];
interface Grid { n: number; kicker: string; cert: string; head: string; body: string; art: string; }
const GRID: Grid[] = [
  { n: 4, kicker: "JERUSALEM — POLITICS", cert: "REPORTED", head: "Eisenkot asked to form Israel's government", body: "President Herzog passes over Netanyahu; the mandate ceremony is on Sunday.", art: "govt" },
  { n: 5, kicker: "UKRAINE — WAR", cert: "REPORTED", head: "Missiles hit Zelenskyy's hometown, 2 dead", body: "Kryvyi Rih: 60 hurt, a hospital and 25 blocks hit. (AP)", art: "missile" },
  { n: 6, kicker: "MEXICO — CARTELS", cert: "REPORTED", head: "11 killed after cartel boss is captured", body: "\u201CEl Chapo Isidro\u201D Meza Flores seized in Sinaloa. (France 24)", art: "arrest" },
  { n: 7, kicker: "GULF — IRAN", cert: "CLAIM", head: "Bahrain plant burns after Iranian attack", body: "Tehran seeks diplomacy; Trump rejects its terms.", art: "fire" },
  { n: 8, kicker: "SOMALIA — DIPLOMACY", cert: "REPORTED", head: "Somalia orders UAE envoy to leave", body: "Mogadishu withdraws its own ambassador too.", art: "envoy" },
  { n: 9, kicker: "GAZA — AID", cert: "REPORTED", head: "Four nations press Israel on Gaza aid", body: "Australia, Canada, Italy and Britain cite flood misery.", art: "aid" },
  { n: 10, kicker: "US — COURTS", cert: "REPORTED", head: "Court backs $7.25bn Roundup settlement", body: "The deal settles weedkiller cancer claims.", art: "court" },
  { n: 11, kicker: "LAS VEGAS — F1", cert: "REPORTED", head: "Verstappen on pole after Antonelli penalty", body: "Antonelli was fastest but drops five places.", art: "race" },
  { n: 12, kicker: "RUGBY", cert: "REPORTED", head: "England thrash the All Blacks 37-12", body: "A record winning margin for England. (BBC)", art: "rugby" },
  { n: 13, kicker: "FOOTBALL", cert: "REPORTED", head: "Arsenal held 2-2; Leeds stun Chelsea 4-1", body: "Madueke rescues a point at Newcastle.", art: "footy" },
  { n: 14, kicker: "ESTONIA — BORDER", cert: "REPORTED", head: "Estonia to close its Russia border", body: "Moscow cries \u201CIron Curtain\u201D.", art: "border" },
  { n: 15, kicker: "FRANCE — JUSTICE", cert: "REPORTED", head: "Police jailed for racist violence", body: "A landmark ruling in France.", art: "justice" },
];
const WIRES: string[] = [
  "16  France: 6th straight Saturday of cost-of-living protests.",
  "17  US: Trump warns of a \u201Ctremendous tax\u201D on AI centres abroad.",
  "18  US: man convicted of starting the deadly 2025 Palisades fire.",
  "19  US: State Dept details $12bn of Venezuelan oil revenue.",
  "20  US: Trump ousts cyber director after outage criticism.",
  "21  Ebola: the death toll passes 5,700, containment goes on.",
  "22  Myanmar: France seeks UN action on the genocide ruling.",
  "23  India-China: commanders meet on the Arunachal frontier.",
  "24  Bangladesh: 30 homes of Awami League members set on fire.",
  "25  Thailand: heavy rain due in 6 provinces on Sunday (Met Dept).",
  "26  Japan: forces to train live-fire at Indian facilities, a first.",
  "27  India: Air India extends Jeddah suspension to 24 Nov.",
  "28  India: ICMR signs off 100 health technology transfers.",
  "29  Cricket: Rahul's century headlines India's Test in NZ.",
  "30  Cricket: Cummins wins unanimous backing as Australia captain.",
  "31  Switzerland: 4,000-year-old bronze ring found in melting ice.",
  "32  Canada: drones sample whale breath, whole genomes sequenced.",
  "33  Australia: bystanders pull a driver from a burning car, Canberra.",
  "34  Tasmania: dead man linked to a police officer's shooting.",
  "35  Business: Leapmotor profit falls 73% despite record sales.",
  "36  Football: PSG win 3-2 at Nice; Doue hurt badly.",
];

// ---------------------------------------------------------------- illustrations
function artBox(x: number, y: number, w: number, h: number, bg: [number, number, number]): void {
  rect(x, y, w, h, bg);
  rect(x, y, w, 1, RULE); rect(x, y + h - 1, w, 1, RULE);
  rect(x, y, 1, h, RULE); rect(x + w - 1, y, 1, h, RULE);
}
function artCOP31(x: number, y: number, w: number, h: number): void {
  artBox(x, y, w, h, [168, 196, 214]);
  // globe
  circle(x + 52, y + h - 34, 26, [46, 110, 88]);
  polyFill([[x + 34, y + h - 30], [x + 46, y + h - 46], [x + 56, y + h - 28], [x + 66, y + h - 40], [x + 70, y + h - 22], [x + 52, y + h - 12]], [96, 164, 110]);
  // negotiation table + seated delegates (head above shoulders, robe below)
  rect(x + 96, y + h - 30, w - 116, 8, [122, 82, 52]);
  const robes: Array<[number, number, number]> = [NAVY, RED_DK, [38, 110, 110], [150, 100, 30], [90, 90, 110]];
  for (let i = 0; i < 5; i++) {
    const dx = x + 112 + i * 38;
    polyFill([[dx - 11, y + h - 36], [dx - 6, y + h - 50], [dx + 6, y + h - 50], [dx + 11, y + h - 36]], robes[i]);
    circle(dx, y + h - 56, 6, [232, 214, 170]);
  }
  // clock showing 06:00
  circle(x + w - 34, y + 30, 20, PAPER);
  circleOutline(x + w - 34, y + 30, 20, INK, 2);
  line(x + w - 34, y + 30, x + w - 34, y + 16, INK, 2);
  line(x + w - 34, y + 30, x + w - 22, y + 30, INK, 2);
  // sun rays
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    line(x + 30 + Math.cos(a) * 8, y + 22 + Math.sin(a) * 8, x + 30 + Math.cos(a) * 16, y + 22 + Math.sin(a) * 16, GOLD, 2);
  }
  circle(x + 30, y + 22, 7, GOLD);
}
function artShip(x: number, y: number, w: number, h: number): void {
  artBox(x, y, w, h, [26, 34, 58]);
  // sea
  rect(x + 1, y + h - 22, w - 2, 21, [38, 62, 96]);
  for (let i = 0; i < 5; i++) line(x + 8 + i * 60, y + h - 12, x + 34 + i * 60, y + h - 12, [120, 150, 190], 1);
  // hull
  polyFill([[x + 60, y + h - 34], [x + w - 60, y + h - 34], [x + w - 80, y + h - 20], [x + 80, y + h - 20]], [96, 32, 28]);
  rect(x + 90, y + h - 52, 60, 18, [150, 52, 40]);
  rect(x + 160, y + h - 52, 40, 18, [120, 42, 34]);
  line(x + 130, y + h - 52, x + 130, y + h - 70, [200, 190, 170], 3);
  // flames
  const flames: Array<[number, number, number]> = [[100, 14], [130, 20], [168, 16], [200, 12]];
  for (const [fx, fh] of flames) {
    polyFill([[x + fx - 9, y + h - 52], [x + fx, y + h - 52 - fh], [x + fx + 9, y + h - 52]], [232, 120, 30]);
    polyFill([[x + fx - 4, y + h - 52], [x + fx, y + h - 52 - fh + 8], [x + fx + 4, y + h - 52]], [246, 200, 60]);
  }
  // smoke
  circle(x + w - 60, y + 26, 10, [150, 150, 150]);
  circle(x + w - 46, y + 18, 13, [170, 170, 170]);
  circle(x + w - 30, y + 12, 9, [190, 190, 190]);
  // drone
  line(x + 30, y + 18, x + 44, y + 18, [220, 220, 220], 2);
  circle(x + 37, y + 18, 3, [220, 220, 220]);
  line(x + 24, y + 14, x + 50, y + 14, [220, 220, 220], 1);
  // stars
  for (const [sx, sy] of [[220, 14], [250, 30], [60, 40], [280, 44]] as Array<[number, number]>) {
    setPx(x + sx, y + sy, [240, 240, 220]); setPx(x + sx + 1, y + sy, [240, 240, 220]);
  }
}
function artQuake(x: number, y: number, w: number, h: number): void {
  artBox(x, y, w, h, [232, 216, 186]);
  // Andes peaks
  polyFill([[x + 1, y + h - 1], [x + 60, y + 18], [x + 120, y + h - 1]], [122, 96, 66]);
  polyFill([[x + 90, y + h - 1], [x + 170, y + 8], [x + 250, y + h - 1]], [96, 74, 50]);
  polyFill([[x + 52, y + 28], [x + 60, y + 18], [x + 68, y + 28], [x + 60, y + 34]], PAPER);
  polyFill([[x + 162, y + 18], [x + 170, y + 8], [x + 178, y + 18], [x + 170, y + 24]], PAPER);
  // seismograph strip
  rect(x + w - 108, y + 10, 98, 34, PAPER);
  rect(x + w - 108, y + 10, 98, 1, RULE); rect(x + w - 108, y + 43, 98, 1, RULE);
  let px0 = x + w - 104, py0 = y + 27;
  const pts: Array<[number, number]> = [[px0, py0]];
  const spikes = [0, 0, 2, -3, 6, -9, 12, -8, 4, -2, 0, 0];
  for (let i = 0; i < spikes.length; i++) pts.push([px0 + 4 + i * 7, py0 - spikes[i]]);
  for (let i = 0; i + 1 < pts.length; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], RED, 2);
  // ground crack
  line(x + 30, y + h - 8, x + 90, y + h - 22, INK, 2);
  line(x + 90, y + h - 22, x + 150, y + h - 10, INK, 2);
  line(x + 150, y + h - 10, x + 210, y + h - 20, INK, 2);
  // M 6.8 badge
  rect(x + w - 66, y + h - 30, 56, 20, RED);
  drawText(BOLD, 13, x + w - 60, y + h - 15, "M 6.8", PAPER);
}
function artSmall(kind: string, x: number, y: number, w: number, h: number): void {
  const bg: [number, number, number] = [228, 214, 180];
  artBox(x, y, w, h, bg);
  const cx = x + w / 2, cy = y + h / 2;
  switch (kind) {
    case "govt": // columns + dome
      rect(x + 14, y + h - 14, w - 28, 4, NAVY);
      for (let i = 0; i < 4; i++) rect(x + 20 + i * 32, y + 14, 8, h - 28, NAVY);
      polyFill([[cx - 26, y + 14], [cx, y + 2], [cx + 26, y + 14]], RED);
      break;
    case "missile": // blast + building
      rect(x + 12, y + h - 20, 34, 16, [90, 80, 66]);
      polyFill([[x + 20, y + h - 20], [x + 30, y + 6], [x + 40, y + h - 20]], [200, 60, 30]);
      polyFill([[x + 26, y + h - 20], [x + 30, y + 16], [x + 34, y + h - 20]], [246, 190, 60]);
      circle(x + w - 26, cy, 12, [200, 60, 30]);
      break;
    case "arrest": // handcuffs
      circle(x + 34, cy, 12, INK); circle(x + 34, cy, 7, bg);
      circle(x + w - 34, cy, 12, INK); circle(x + w - 34, cy, 7, bg);
      line(x + 44, cy - 4, x + w - 44, cy - 4, INK, 3);
      break;
    case "fire": // flame + refinery
      rect(x + 12, y + h - 16, 26, 12, GREY);
      rect(x + 44, y + h - 22, 20, 18, GREY);
      line(x + 70, y + h - 26, x + 70, y + 8, GREY, 4);
      polyFill([[x + w - 44, y + h - 4], [x + w - 30, y + 6], [x + w - 16, y + h - 4]], [232, 110, 30]);
      polyFill([[x + w - 36, y + h - 4], [x + w - 30, y + 16], [x + w - 24, y + h - 4]], [246, 200, 60]);
      break;
    case "envoy": // flag + plane
      line(x + 16, y + 6, x + 16, y + h - 6, INK, 2);
      polyFill([[x + 16, y + 6], [x + 52, y + 12], [x + 16, y + 20]], RED);
      polyFill([[x + 70, cy], [x + w - 16, cy - 6], [x + w - 16, cy + 6]], NAVY);
      line(x + 80, cy - 10, x + 96, cy - 16, NAVY, 2);
      break;
    case "aid": // cross + boxes
      rect(x + 14, y + h - 16, 30, 12, [150, 110, 60]);
      rect(x + 48, y + h - 16, 30, 12, [120, 90, 50]);
      circle(cx + 34, cy - 4, 14, PAPER); circleOutline(cx + 34, cy - 4, 14, RED, 2);
      rect(cx + 28, cy - 8, 12, 8, RED); rect(cx + 31, cy - 11, 6, 14, RED);
      break;
    case "court": // scales
      line(cx, y + 8, cx, y + h - 10, INK, 2);
      line(cx - 26, y + 12, cx + 26, y + 12, INK, 2);
      line(cx - 26, y + 12, cx - 34, y + 26, INK, 1);
      line(cx - 26, y + 12, cx - 18, y + 26, INK, 1);
      line(cx + 26, y + 12, cx + 18, y + 26, INK, 1);
      line(cx + 26, y + 12, cx + 34, y + 26, INK, 1);
      polyFill([[cx - 38, y + 26], [cx - 14, y + 26], [cx - 26, y + 34]], GOLD);
      polyFill([[cx + 14, y + 26], [cx + 38, y + 26], [cx + 26, y + 34]], GOLD);
      break;
    case "race": // chequered flag + car
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++)
        if ((i + j) % 2 === 0) rect(x + 12 + i * 8, y + 6 + j * 7, 8, 7, INK);
      polyFill([[x + 60, y + h - 18], [x + 76, y + h - 30], [x + 120, y + h - 30], [x + 134, y + h - 18]], RED);
      circle(x + 78, y + h - 14, 7, INK); circle(x + 118, y + h - 14, 7, INK);
      break;
    case "rugby": // ball + posts
      polyFill([[cx - 30, cy], [cx, cy - 12], [cx + 30, cy], [cx, cy + 12]], [150, 90, 50]);
      line(cx, cy - 12, cx, cy + 12, PAPER, 1);
      line(x + w - 24, y + 6, x + w - 24, y + h - 6, INK, 2);
      line(x + w - 24, y + 12, x + w - 10, y + 12, INK, 2);
      break;
    case "footy": // ball
      circle(cx, cy, 15, PAPER); circleOutline(cx, cy, 15, INK, 2);
      polyFill([[cx - 5, cy - 4], [cx + 5, cy - 4], [cx, cy + 6]], INK);
      line(cx, cy - 15, cx, cy - 4, INK, 1); line(cx - 13, cy + 7, cx - 5, cy - 4, INK, 1);
      line(cx + 13, cy + 7, cx + 5, cy - 4, INK, 1);
      break;
    case "border": // fence + sign
      for (let i = 0; i < 6; i++) vline(x + 14 + i * 22, y + 8, h - 16, INK, 2);
      hline(x + 10, y + 14, w - 20, INK, 2); hline(x + 10, y + h - 14, w - 20, INK, 2);
      rect(x + w - 52, y + h - 26, 40, 18, RED);
      drawText(BOLD, 10, x + w - 47, y + h - 13, "STOP", PAPER);
      break;
    case "justice": // gavel
      line(x + 20, y + h - 12, x + w - 30, y + 14, [120, 84, 50], 4);
      rect(x + w - 52, y + 8, 34, 12, [120, 84, 50]);
      rect(x + 16, y + h - 14, w - 32, 5, NAVY);
      break;
    default:
      circle(cx, cy, 12, GOLD);
  }
}

// ---------------------------------------------------------------- layout
const MX = 20; // margin
const CW = W - 2 * MX; // 984

function certTag(xRight: number, yTop: number, cert: string): void {
  const f = BOLD, s = 8.5;
  const w = textWidth(f, s, cert) + 8;
  const x = xRight - w;
  rect(x, yTop, w, 12, cert === "CLAIM" ? RED : NAVY);
  drawText(f, s, x + 4, yTop + 9.5, cert, PAPER);
}

function drawLeads(y0: number): void {
  const colW = 322, gap = 9;
  LEADS.forEach((L, i) => {
    const x = MX + i * (colW + gap);
    if (i === 0) artCOP31(x, y0, colW, 78);
    else if (i === 1) artShip(x, y0, colW, 78);
    else artQuake(x, y0, colW, 78);
    const ky = y0 + 78 + 13;
    drawText(BOLD, 10, x, ky, `${L.n}  ${L.kicker}`, RED);
    certTag(x + colW, y0 + 78 + 2, L.cert);
    const hy = ky + 6;
    drawPara(BOLD, 20, 23, x, hy, colW, L.head, INK, 2);
    const by = hy + 48;
    drawPara(REG, 12, 14.5, x, by, colW, L.body, INK, 3);
  });
}

function drawGrid(y0: number): void {
  const cols = 6, gap = 8;
  const colW = Math.floor((CW - gap * (cols - 1)) / cols); // 157
  const rowH = 124;
  GRID.forEach((G, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const x = MX + c * (colW + gap);
    const y = y0 + r * (rowH + 8);
    artSmall(G.art, x, y, colW, 44);
    const ky = y + 44 + 11;
    drawText(BOLD, 8.5, x, ky, `${G.n}  ${G.kicker}`, RED);
    const hy = ky + 4;
    drawPara(BOLD, 12, 14, x, hy, colW, G.head, INK, 2);
    drawPara(REG, 10, 12, x, hy + 30, colW, G.body, INK, 3);
  });
}

function drawMap(x0: number, y0: number, w: number, h: number): void {
  rect(x0, y0, w, h, SEA);
  rect(x0, y0, w, 1, RULE); rect(x0, y0 + h - 1, w, 1, RULE);
  rect(x0, y0, 1, h, RULE); rect(x0 + w - 1, y0, 1, h, RULE);
  const LON0 = -170, LON1 = 190, LAT0 = 80, LAT1 = -58;
  const sx = w / (LON1 - LON0), sy = h / (LAT0 - LAT1);
  const proj = (lon: number, lat: number): [number, number] => [
    x0 + (lon - LON0) * sx,
    y0 + (LAT0 - lat) * sy,
  ];
  for (const cont of CONTINENTS) {
    const pts = cont.map(([lo, la]) => proj(lo, la));
    polyFill(pts, LAND);
    polyStroke(pts, LAND_DK, 1);
  }
  // graticule
  for (const lon of [-120, -60, 0, 60, 120]) {
    const [gx] = proj(lon, 0);
    for (let yy = y0 + 2; yy < y0 + h - 2; yy += 6) setPx(Math.round(gx), yy, [200, 188, 158]);
  }
  // Pins: discs that would overlap are nudged with a leader line to a dot
  // at the true location (1/4/9 in the E. Mediterranean, 12/13 in England).
  const OFF: Record<number, [number, number]> = {
    1: [-15, -11], 9: [13, 11], 12: [-13, 11], 13: [11, -13],
  };
  for (const [n, lat, lon] of PINS) {
    const [pxx, pyy] = proj(lon, lat);
    const off = OFF[n] ?? [0, 0];
    const dx = pxx + off[0], dy = pyy + off[1];
    if (off[0] !== 0 || off[1] !== 0) {
      line(pxx, pyy, dx, dy, INK, 1);
      circle(pxx, pyy, 2, INK);
    }
    circle(dx, dy, 8, RED);
    circleOutline(dx, dy, 8, PAPER, 1);
    const num = String(n);
    const tw = textWidth(BOLD, 9, num);
    drawText(BOLD, 9, dx - tw / 2, dy + 3.5, num, PAPER);
  }
}

function drawWires(x0: number, y0: number, w: number): number {
  drawText(BOLD, 12.5, x0, y0 + 11, "ALSO ON SUNDAY 22 NOVEMBER — 21 MORE STORIES", RED);
  hline(x0, y0 + 16, w, RED, 2);
  let y = y0 + 30;
  for (const item of WIRES) {
    const num = item.split(" ")[0];
    const rest = item.slice(num.length + 2);
    const nw = textWidth(BOLD, 10.5, num + " ");
    drawText(BOLD, 10.5, x0, y, num, RED);
    const lines = wrapLines(REG, 10.5, rest, w - nw - 2);
    for (let li = 0; li < lines.length; li++) {
      drawText(REG, 10.5, x0 + nw + (li === 0 ? 0 : 0), y + li * 12, lines[li], INK);
    }
    y += Math.max(1, lines.length) * 12;
  }
  return y;
}

function render(): void {
  fillAll(CREAM);
  // --- top navy bar
  rect(0, 0, W, 26, NAVY);
  drawText(BOLD, 12, MX, 18, "THE WORLD IN ONE DAY", PAPER);
  const tr = "36 STORIES · 7 REGIONS · EVERY ONE DATED SUNDAY 22 NOVEMBER 2026";
  drawText(BOLD, 10.5, W - MX - textWidth(BOLD, 10.5, tr), 18, tr, GOLD_LT);
  // --- masthead
  centerText(BOLD, 52, W / 2, 84, "Sunday 22 November 2026", INK);
  // --- sub-deck
  centerText(ITAL, 18, W / 2, 110, "COP31 nears a climate deal in Antalya · Russian ship ablaze in the Baltic · Earthquake shakes Peru", RED);
  hline(MX, 118, CW, INK, 2);
  // --- stats strip (6 columns)
  const stats: Array<[string, string, string]> = [
    ["06:00", "GMT: COP31 plenary", "to approve the deal"],
    ["~200", "delegations deadlocked", "in Antalya"],
    ["6.8", "magnitude: earthquake", "in Peru's Andes"],
    ["DAYS", "Finland: ship fire", "could burn for days"],
    ["37-12", "England's record win", "over All Blacks"],
    ["$7.25bn", "Roundup settlement", "endorsed"],
  ];
  const sw = CW / 6;
  stats.forEach(([big, c1, c2], i) => {
    const cx = MX + i * sw + sw / 2;
    centerText(BOLD, 27, cx, 148, big, RED);
    centerText(REG, 9.5, cx, 159, c1, INK);
    centerText(REG, 9.5, cx, 170, c2, INK);
    if (i > 0) vline(MX + i * sw, 126, 44, [200, 186, 156], 1);
  });
  hline(MX, 174, CW, INK, 1);
  // --- region bar
  const regions: Array<[string, number, [number, number, number]]> = [
    ["EUROPE 8", 8, [38, 110, 110]],
    ["MIDDLE EAST 4", 4, RED],
    ["AMERICAS 7", 7, [38, 72, 130]],
    ["ASIA-PACIFIC 9", 9, [176, 120, 30]],
    ["AFRICA 3", 3, [60, 120, 60]],
    ["OCEANIA 3", 3, [110, 80, 140]],
    ["WORLD 2", 2, [90, 85, 78]],
  ];
  let rx = MX;
  for (const [label, cnt, col] of regions) {
    const wseg = Math.round((CW * cnt) / 36);
    rect(rx, 178, wseg, 18, col);
    centerText(BOLD, 10, rx + wseg / 2, 191, label, PAPER);
    rx += wseg;
  }
  // --- timeline navy bar
  rect(MX, 200, CW, 18, NAVY);
  drawText(BOLD, 10.5, MX + 8, 212, "THE DAY IN UTC", GOLD_LT);
  const tl: Array<[string, string]> = [
    ["Late Sat", "COP31 package unveiled"],
    ["Sat night", "Sparta II fire out of control"],
    ["03:00 GMT", "Objections to COP text due"],
    ["06:00 GMT", "Plenary to approve the deal"],
    ["Sunday", "Eisenkot mandate ceremony"],
  ];
  let tx = MX + 118;
  for (const [t, d] of tl) {
    drawText(BOLD, 9.5, tx, 212, t, GOLD_LT);
    tx += textWidth(BOLD, 9.5, t) + 5;
    drawText(REG, 9.5, tx, 212, d, PAPER);
    tx += textWidth(REG, 9.5, d) + 16;
  }
  // --- leads
  drawLeads(224);
  hline(MX, 414, CW, INK, 1);
  // --- grid 4-15
  drawGrid(420);
  // --- bottom: map + wires
  const by0 = 674;
  drawText(BOLD, 12.5, MX, by0 + 11, "WHERE IT HAPPENED", RED);
  drawText(REG, 9.5, MX + 150, by0 + 11, "pins match story numbers", GREY);
  drawMap(MX, by0 + 18, 476, 182);
  const legY = by0 + 18 + 182 + 13;
  drawPara(REG, 9, 11.5, MX, legY, 476,
    "1 ANTALYA · 2 GULF OF FINLAND · 3 PERU · 4 JERUSALEM · 5 KRYVYI RIH · 6 SINALOA · 7 BAHRAIN · 8 MOGADISHU · 9 GAZA · 10 USA · 11 LAS VEGAS · 12 TWICKENHAM · 13 NEWCASTLE", INK, 3);
  drawWires(508, by0, 496);
  // --- DATE CHECK
  const dy = 948;
  rect(MX, dy, CW, 48, PAPER);
  rect(MX, dy, CW, 2, RED); rect(MX, dy + 46, CW, 2, RED);
  rect(MX, dy, 2, 48, RED); rect(MX + CW - 2, dy, 2, 48, RED);
  drawText(BOLD, 11.5, MX + 10, dy + 15, "DATE CHECK — EARLY EDITION:", RED);
  drawText(REG, 11.5, MX + 10 + textWidth(BOLD, 11.5, "DATE CHECK — EARLY EDITION: "), dy + 15,
    "wires as of about 00:20 UTC, Sunday 22 November 2026.", INK);
  drawText(REG, 11.5, MX + 10, dy + 30,
    "Left out as Saturday 21 November news: the Kyiv bridge strikes, the Shenzhen summit and India's Nitish Setu opening.", INK);
  drawText(REG, 11.5, MX + 10, dy + 44, "Still to come at press time: COP31's vote.", INK);
  // --- footer
  drawText(REG, 9, MX, 1006,
    "Sources: Reuters · BBC · AP · France 24 · Finnish Border Guard · Wire reports — CERTAINTY: REPORTED = carried by the day's wires · CLAIM = one side's account · FORECAST = still to happen when drawn", GREY);
  // --- bottom navy bar
  rect(0, 1012, W, 12, NAVY);
  drawText(BOLD, 8.5, MX, 1021, "THE WORLD IN ONE DAY", PAPER);
  const br = "SUNDAY 22 NOVEMBER 2026 · ONE PAGE";
  drawText(BOLD, 8.5, W - MX - textWidth(BOLD, 8.5, br), 1021, br, GOLD_LT);
}

// ---------------------------------------------------------------- PNG
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  const prev = Buffer.alloc(W * 3);
  for (let y = 0; y < H; y++) {
    const row = px.subarray(y * W * 3, (y + 1) * W * 3);
    // choose best filter per row (min sum of |signed byte|)
    let bestF = 0, bestCost = Infinity;
    for (let f = 0; f <= 4; f++) {
      let cost = 0;
      for (let x = 0; x < W * 3; x++) {
        let v: number;
        const a = x >= 3 ? row[x - 3] : 0;
        const b = prev[x];
        const c = x >= 3 ? prev[x - 3] : 0;
        if (f === 0) v = row[x];
        else if (f === 1) v = row[x] - a;
        else if (f === 2) v = row[x] - b;
        else if (f === 3) v = row[x] - ((a + b) >> 1);
        else { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = row[x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        const s = v & 0xff;
        cost += s < 128 ? s : 256 - s;
      }
      if (cost < bestCost) { bestCost = cost; bestF = f; }
    }
    const off = y * (1 + W * 3);
    raw[off] = bestF;
    for (let x = 0; x < W * 3; x++) {
      const a = x >= 3 ? row[x - 3] : 0;
      const b = prev[x];
      const c = x >= 3 ? prev[x - 3] : 0;
      let v: number;
      if (bestF === 0) v = row[x];
      else if (bestF === 1) v = row[x] - a;
      else if (bestF === 2) v = row[x] - b;
      else if (bestF === 3) v = row[x] - ((a + b) >> 1);
      else { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = row[x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      raw[off + 1 + x] = v & 0xff;
    }
    prev.set(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

render();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), encodePNG());
