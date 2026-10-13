#!/usr/bin/env node
// Builds workspace packages in dependency order.
//
// `npm run build --workspaces` builds in directory order, which puts
// authoring before the core it imports and schemas last of all. That
// only works when every dist/ already exists. Internal dependency ranges
// (core on oes-schemas ^0.2.0, everything else on oes-core ^0.4.0) are
// often ahead of what is on npm, so npm links the local workspace package,
// and its dist/ has to be built first. On a fresh clone it isn't.
//
//   node scripts/build-workspaces.mjs                  build everything
//   node scripts/build-workspaces.mjs --deps-of <pkg>  build only what <pkg>
//                                                      depends on, not <pkg>
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGES = join(ROOT, "packages");

const workspaces = new Map();
for (const dir of readdirSync(PACKAGES)) {
  const pkg = JSON.parse(readFileSync(join(PACKAGES, dir, "package.json"), "utf8"));
  workspaces.set(pkg.name, pkg);
}

function internalDeps(name) {
  const pkg = workspaces.get(name);
  const all = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.devDependencies };
  return Object.keys(all).filter((dep) => workspaces.has(dep));
}

// Depth-first topological order; throws on a cycle rather than looping.
function order(names) {
  const done = new Set();
  const visiting = new Set();
  const out = [];
  const visit = (name) => {
    if (done.has(name)) return;
    if (visiting.has(name)) throw new Error(`Dependency cycle through ${name}`);
    visiting.add(name);
    for (const dep of internalDeps(name)) visit(dep);
    visiting.delete(name);
    done.add(name);
    out.push(name);
  };
  for (const name of names) visit(name);
  return out;
}

const args = process.argv.slice(2);
let targets;
if (args[0] === "--deps-of") {
  const pkg = args[1];
  if (!workspaces.has(pkg)) throw new Error(`Unknown workspace package: ${pkg}`);
  targets = order([pkg]).filter((name) => name !== pkg);
} else {
  targets = order([...workspaces.keys()].sort());
}

for (const name of targets) {
  console.log(`\n== build ${name}`);
  execFileSync("npm", ["run", "build", "--workspace", name], { cwd: ROOT, stdio: "inherit" });
}
