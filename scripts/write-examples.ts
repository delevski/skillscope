import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SAMPLE_FILES } from "../src/core/samples";

for (const f of SAMPLE_FILES) {
  const target = join("examples", f.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, f.content);
}
console.log(`wrote ${SAMPLE_FILES.length} example files`);
