import { resolve } from "node:path";
import { buildHub, checkHub, type HubRunResult } from "./hub.js";
import { HubFileError } from "./hub-files.js";

const USAGE = `Usage:
  oes-hub check [hub-dir]                 Validate the hub and every unpublished version; write nothing
  oes-hub build [hub-dir] [--out <dir>]   Publish new versions to store/, then generate the site in <dir>

hub-dir defaults to the current directory. A hub is a folder with hub.json,
packages/{namespace}/{name}.yml source files, and store/ (written by build).`;

function report(result: HubRunResult): void {
  for (const issue of result.issues) {
    const tag = issue.severity === "error" ? "error  " : "warning";
    console.log(`${tag} ${issue.where}: ${issue.message}`);
  }
  const errors = result.issues.filter((i) => i.severity === "error").length;
  const warnings = result.issues.length - errors;
  const verb = result.published.length ? `${result.published.length} new version(s): ${result.published.join(", ")}` : "no new versions";
  console.log(`\n${result.ok ? "✓" : "✗"} ${verb}; ${errors} error(s), ${warnings} warning(s)`);
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    return command ? 0 : 1;
  }
  let hubDir = ".";
  let out: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--out") out = rest[++i];
    else if (rest[i]!.startsWith("-")) {
      console.error(`Unknown option ${rest[i]}\n\n${USAGE}`);
      return 1;
    } else hubDir = rest[i]!;
  }
  const log = (m: string) => console.log(m);
  try {
    if (command === "check") {
      const result = await checkHub(resolve(hubDir), { log });
      report(result);
      return result.ok ? 0 : 1;
    }
    if (command === "build") {
      const result = await buildHub(resolve(hubDir), { log, ...(out ? { out: resolve(out) } : {}) });
      report(result);
      return result.ok ? 0 : 1;
    }
  } catch (e) {
    if (e instanceof HubFileError) {
      console.error(`error   ${e.message}`);
      return 1;
    }
    throw e;
  }
  console.error(`Unknown command "${command}"\n\n${USAGE}`);
  return 1;
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
