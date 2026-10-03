import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { crc32 } from "./crc32.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const BUNDLE = join(DIST, "content.bundle.js");
const SW_BUNDLE = join(DIST, "service-worker.bundle.js");

if (!existsSync(BUNDLE)) {
  console.error("package: dist/content.bundle.js is missing — run `npm run bundle` first.");
  process.exit(1);
}
if (!existsSync(SW_BUNDLE)) {
  console.error("package: dist/service-worker.bundle.js is missing — run `npm run bundle` first.");
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const entries = [];
function addFile(name, absPath) {
  entries.push({ name: name.replace(/\\/g, "/"), data: readFileSync(absPath) });
}

addFile("manifest.json", join(ROOT, "manifest.json"));
addFile("LICENSE", join(ROOT, "LICENSE"));
if (existsSync(join(ROOT, "README.md"))) addFile("README.md", join(ROOT, "README.md"));
if (existsSync(join(ROOT, "CHANGELOG.md"))) addFile("CHANGELOG.md", join(ROOT, "CHANGELOG.md"));
for (const file of readdirSync(join(ROOT, "icons"))) {
  // icon-16/32/48/128 are the runtime-referenced sizes. SFA_RTL.png is the
  // 1.2 MB master artwork: it is the SOURCE for the generated sizes (see
  // scripts/icons.js) and is referenced by nothing at runtime, so shipping
  // it would only bloat the store package.
  if (file.endsWith(".png") && file !== "SFA_RTL.png") {
    addFile(join("icons", file), join(ROOT, "icons", file));
  }
}
for (const file of walk(join(ROOT, "src"))) {
  addFile(relative(ROOT, file), file);
}
addFile("dist/content.bundle.js", BUNDLE);
addFile("dist/service-worker.bundle.js", SW_BUNDLE);
for (const name of ["dist/fonts.css", "dist/fonts.ui.css", "dist/fonts.manifest.json"]) {
  const abs = join(ROOT, name);
  if (existsSync(abs)) addFile(name, abs);
}
const LICENSES_DIR = join(ROOT, "licenses");
if (existsSync(LICENSES_DIR)) {
  for (const file of walk(LICENSES_DIR)) addFile(relative(ROOT, file), file);
}
const FONTS_DIR = join(ROOT, "fonts");
if (existsSync(FONTS_DIR)) {
  for (const file of readdirSync(FONTS_DIR)) {
    if (/\.(woff2|woff|ttf|otf)$/i.test(file)) addFile(join("fonts", file), join(FONTS_DIR, file));
  }
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function buildZip(items) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, day } = dosDateTime();

  for (const item of items) {
    const nameBuf = Buffer.from(item.name, "utf8");
    const crc = crc32(item.data);
    const deflated = deflateRawSync(item.data, { level: 9 });
    const useDeflate = deflated.length < item.data.length;
    const stored = useDeflate ? deflated : item.data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(item.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuf, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(item.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + stored.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const centralOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(items.length, 8);
  eocd.writeUInt16LE(items.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuf, eocd]);
}

const zipPath = join(DIST, `rtl-atelier-v${version}.zip`);
writeFileSync(zipPath, buildZip(entries));
console.log(`package: ${entries.length} files -> ${relative(ROOT, zipPath)}`);
