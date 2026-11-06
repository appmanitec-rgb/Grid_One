import { createRequire } from "node:module";
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const frontend = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const directory = path.join(frontend, "public", "pdfjs");
await mkdir(directory, { recursive: true });
await copyFile(
  require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"),
  path.join(directory, "pdf.worker.min.mjs"),
);
