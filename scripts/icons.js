import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "./crc32.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICON_DIR = join(ROOT, "icons");
const SIZES = [16, 32, 48, 128];
const SS = 4;
const MASTER_ARTWORK = join(ICON_DIR, "SFA_RTL.png");

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 4 + 1);
    raw[offset] = 0;
    rgba.copy(raw, offset + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function sdRoundedRect(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by, r) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t)) - r;
}

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

function sdBowl(u, v) {
  const cx = 0.355;
  const cy = 0.565;
  const R = 0.16;
  const halfT = 0.047;
  const gap = 0.62;
  const dx = u - cx;
  const dy = v - cy;
  const dist = Math.hypot(dx, dy);
  let t = Math.atan2(dy, dx) + Math.PI / 2;
  while (t > Math.PI) t -= 2 * Math.PI;
  while (t < -Math.PI) t += 2 * Math.PI;
  if (Math.abs(t) >= gap) return Math.abs(dist - R) - halfT;
  const a1 = -Math.PI / 2 + gap;
  const a2 = -Math.PI / 2 - gap;
  const d1 = Math.hypot(u - (cx + R * Math.cos(a1)), v - (cy + R * Math.sin(a1)));
  const d2 = Math.hypot(u - (cx + R * Math.cos(a2)), v - (cy + R * Math.sin(a2)));
  return Math.min(d1, d2) - halfT;
}

function coverage(dist, pixel) {
  return clamp01(0.5 - dist / (2 * pixel));
}

const TILE_A = [141, 114, 246];
const TILE_B = [60, 47, 174];
const GLYPH_A = [255, 255, 255];
const GLYPH_B = [199, 244, 238];

function shade(u, v, pixel) {
  const dTile = sdRoundedRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.235);
  const tileCov = coverage(dTile, pixel);
  if (tileCov <= 0) return [0, 0, 0, 0];

  let color = lerp3(TILE_A, TILE_B, clamp01(u * 0.55 + v * 0.8 - 0.15));

  const shine = clamp01((0.5 - v) / 0.44) * 0.3;
  color = lerp3(color, [255, 255, 255], shine);

  const alef = sdSegment(u, v, 0.685, 0.27, 0.685, 0.72, 0.052);
  const bowl = sdBowl(u, v);
  const dot = sdCircle(u, v, 0.36, 0.8, 0.03);
  const glyphCov = Math.max(coverage(alef, pixel), coverage(bowl, pixel), coverage(dot, pixel));
  color = lerp3(color, lerp3(GLYPH_A, GLYPH_B, clamp01((v - 0.2) / 0.65)), glyphCov);

  const stroke = clamp01(1 - Math.abs(dTile + 0.012) / 0.014) * 0.22;
  color = lerp3(color, [255, 255, 255], stroke);

  return [color[0], color[1], color[2], tileCov];
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const pixel = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let accA = 0;
      let accR = 0;
      let accG = 0;
      let accB = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const [r, g, b, a] = shade(u, v, pixel / SS);
          const w = (1 - accA) * a;
          accA += w;
          accR += w * r;
          accG += w * g;
          accB += w * b;
        }
      }
      const o = (y * size + x) * 4;
      if (accA > 0) {
        rgba[o] = Math.round(accR / accA);
        rgba[o + 1] = Math.round(accG / accA);
        rgba[o + 2] = Math.round(accB / accA);
      }
      rgba[o + 3] = Math.round(accA * 255);
    }
  }
  return encodePng(size, size, rgba);
}

/* ------------------------------------------------------------------ *
 * Master-artwork path: decode icons/SFA_RTL.png, area-average it to the
 * manifest sizes, re-encode. The procedural rasterizer below remains the
 * fallback when the master file is absent.
 * ------------------------------------------------------------------ */

function decodePng(buffer) {
  if (buffer.readUInt32BE(12) !== 0x49484452) throw new Error("not a PNG (IHDR missing)");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const interlace = buffer[28];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG variant (depth=${bitDepth} color=${colorType} interlace=${interlace})`);
  }
  const idat = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(height * stride);
  const pos = (x, y) => y * stride + x * 4;
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[line + x];
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= 4 ? rgba[(y - 1) * stride + x - 4] : 0;
      let value;
      if (filter === 0) value = rawByte;
      else if (filter === 1) value = rawByte + left;
      else if (filter === 2) value = rawByte + up;
      else if (filter === 3) value = rawByte + ((left + up) >> 1);
      else value = rawByte + paeth(left, up, ul);
      rgba[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, rgba, pos };
}

/**
 * Area-average downscale with premultiplied alpha: every destination pixel
 * averages the exact source rectangle it covers, so a 1254→16 shrink stays
 * clean (bilinear would alias badly at this ratio).
 */
function downscale(source, target) {
  const { width: sw, height: sh, rgba } = source;
  const out = Buffer.alloc(target * target * 4);
  for (let y = 0; y < target; y++) {
    const y0 = (y * sh) / target;
    const y1 = ((y + 1) * sh) / target;
    for (let x = 0; x < target; x++) {
      const x0 = (x * sw) / target;
      const x1 = ((x + 1) * sw) / target;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let weight = 0;
      for (let sy = Math.floor(y0); sy < Math.min(sh, Math.ceil(y1)); sy++) {
        const yCover = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (yCover <= 0) continue;
        for (let sx = Math.floor(x0); sx < Math.min(sw, Math.ceil(x1)); sx++) {
          const xCover = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (xCover <= 0) continue;
          const w = xCover * yCover;
          const o = (sy * sw + sx) * 4;
          const alpha = rgba[o + 3] / 255;
          r += rgba[o] * alpha * w;
          g += rgba[o + 1] * alpha * w;
          b += rgba[o + 2] * alpha * w;
          a += alpha * w;
          weight += w;
        }
      }
      const o = (y * target + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round((a / weight) * 255);
    }
  }
  return out;
}

mkdirSync(ICON_DIR, { recursive: true });

if (existsSync(MASTER_ARTWORK)) {
  const master = decodePng(readFileSync(MASTER_ARTWORK));
  for (const size of SIZES) {
    writeFileSync(join(ICON_DIR, `icon-${size}.png`), encodePng(size, size, downscale(master, size)));
    console.log(`icon: icons/icon-${size}.png (from SFA_RTL.png ${master.width}x${master.height})`);
  }
} else {
  for (const size of SIZES) {
    const file = join(ICON_DIR, `icon-${size}.png`);
    writeFileSync(file, render(size));
    console.log(`icon: icons/icon-${size}.png`);
  }
}
