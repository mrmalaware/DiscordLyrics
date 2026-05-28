const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const vencordSource = path.join(root, "vencord-userplugin", "spotifyLyricsStatus");
const vencordDist = path.join(dist, "vencord", "spotifyLyricsStatus");
const packageDir = path.join(dist, "package");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

function copyDir(from, to) {
  ensureDir(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(source, target);
    } else {
      copyFile(source, target);
    }
  }
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function listFiles(dir, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listFiles(absolute, relative));
    } else {
      files.push({ absolute, relative: relative.replace(/\\/g, "/") });
    }
  }
  return files;
}

function createZip(sourceDir, outFile) {
  const files = listFiles(sourceDir);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.relative);
    const data = fs.readFileSync(file.absolute);
    const compressed = zlib.deflateRawSync(data);
    const stat = fs.statSync(file.absolute);
    const { dosTime, dosDate } = dosDateTime(stat.mtime);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(outFile, Buffer.concat([...localParts, ...centralParts, end]));
}

fs.rmSync(dist, { recursive: true, force: true });
ensureDir(dist);
copyFile(path.join(root, "SpotifyLyricsStatus.plugin.js"), path.join(dist, "SpotifyLyricsStatus.plugin.js"));
copyFile(path.join(root, "scripts", "DiscordLyrics-Installer.ps1"), path.join(dist, "DiscordLyrics-Installer.ps1"));
copyFile(path.join(root, "scripts", "DiscordLyrics-Installer.cmd"), path.join(dist, "DiscordLyrics-Installer.cmd"));
copyDir(vencordSource, vencordDist);
createZip(path.join(dist, "vencord"), path.join(dist, "vencord-spotifyLyricsStatus.zip"));
ensureDir(packageDir);
copyFile(path.join(dist, "SpotifyLyricsStatus.plugin.js"), path.join(packageDir, "BetterDiscord", "SpotifyLyricsStatus.plugin.js"));
copyFile(path.join(dist, "vencord-spotifyLyricsStatus.zip"), path.join(packageDir, "Vencord", "vencord-spotifyLyricsStatus.zip"));
copyFile(path.join(dist, "DiscordLyrics-Installer.ps1"), path.join(packageDir, "DiscordLyrics-Installer.ps1"));
copyFile(path.join(dist, "DiscordLyrics-Installer.cmd"), path.join(packageDir, "DiscordLyrics-Installer.cmd"));
copyFile(path.join(root, "README.md"), path.join(packageDir, "README.md"));
copyFile(path.join(root, "LICENSE"), path.join(packageDir, "LICENSE"));
copyFile(path.join(root, "CHANGELOG.md"), path.join(packageDir, "CHANGELOG.md"));
createZip(packageDir, path.join(dist, "DiscordLyrics-release.zip"));

console.log("Release package ready in dist/");
