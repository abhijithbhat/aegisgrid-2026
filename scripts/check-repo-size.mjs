import { lstat } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const LIMIT_BYTES = 10 * 1024 * 1024;

const output = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
);

const paths = output.split("\0").filter(Boolean);
let total = 0;

for (const path of paths) {
  try {
    const stats = await lstat(path);
    if (stats.isFile()) total += stats.size;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    // A tracked deletion is part of the current payload and contributes zero bytes.
  }
}

const sizeMiB = total / 1024 / 1024;
console.log(`Repository payload: ${sizeMiB.toFixed(2)} MiB across ${paths.length} files.`);

if (total >= LIMIT_BYTES) {
  console.error(
    `Repository exceeds the 10 MiB submission limit by ${((total - LIMIT_BYTES) / 1024).toFixed(1)} KiB.`,
  );
  process.exit(1);
}

console.log(
  `PASS: ${(LIMIT_BYTES - total) / 1024 / 1024 >= 1 ? ((LIMIT_BYTES - total) / 1024 / 1024).toFixed(2) : ((LIMIT_BYTES - total) / 1024).toFixed(1)} ${LIMIT_BYTES - total >= 1024 * 1024 ? "MiB" : "KiB"} remaining.`,
);
