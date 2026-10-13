import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildScaffold, type ScaffoldFile, type ScaffoldOptions } from "./templates.js";

export interface GenerateOptions extends ScaffoldOptions {
  outDir: string;
  /** Write into outDir even if it already exists and isn't empty. */
  force?: boolean;
}

export interface GenerateResult {
  outDir: string;
  /** Every file written, relative to outDir. */
  files: string[];
}

async function assertSafeToWrite(outDir: string, force: boolean): Promise<void> {
  if (force) return;
  let entries: string[];
  try {
    entries = await readdir(outDir);
  } catch {
    return; // Doesn't exist yet — safe either way.
  }
  if (entries.length > 0) {
    throw new Error(
      `${outDir} already exists and isn't empty. Refusing to write into it — pass force: true / --force ` +
        `if this is intentional, or choose a different (or new) directory.`,
    );
  }
}

/** Writes {@link buildScaffold}'s output to disk under outDir. */
export async function generateScaffold(options: GenerateOptions): Promise<GenerateResult> {
  const { outDir, force = false, ...scaffoldOptions } = options;
  await assertSafeToWrite(outDir, force);

  const files: ScaffoldFile[] = buildScaffold(scaffoldOptions);
  for (const file of files) {
    const fullPath = join(outDir, file.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content, "utf8");
  }

  return { outDir, files: files.map((file) => file.path) };
}
