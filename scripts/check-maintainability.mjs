import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const limits = [
  { directory: "app/components", extensions: new Set([".ts", ".tsx"]), maxLines: 500 },
  { directory: "app/styles", extensions: new Set([".css"]), maxLines: 1_000 },
];

const violations = [];
let checkedFiles = 0;

for (const rule of limits) {
  const directory = path.resolve(process.cwd(), rule.directory);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !rule.extensions.has(path.extname(entry.name))) continue;
    const file = path.join(directory, entry.name);
    const source = await readFile(file, "utf8");
    const lines = source === "" ? 0 : source.split(/\r?\n/).length;
    checkedFiles += 1;
    if (lines > rule.maxLines) {
      violations.push(
        `${path.relative(process.cwd(), file)}: ${lines} lines (max ${rule.maxLines})`,
      );
    }
  }
}

if (violations.length) {
  console.error("Maintainability boundary exceeded:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Maintainability boundaries passed for ${checkedFiles} component/style modules.`);
}
