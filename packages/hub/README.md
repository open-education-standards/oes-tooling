# @inklyre/oes-hub

Build and check a static [OES hub](https://open-education-standards.github.io/oes/specs/opk/hubs):
a folder of files, served over HTTPS, that lists OPK packages so anyone can
browse and import them. No server, database or accounts. Library plus the
`oes-hub` CLI.

## A hub's own repository

```
hub.json                              the hub's title and settings
packages/{namespace}/{name}.yml       one source file per package
store/{namespace}/{name}/{version}/   each published version, written once by `build`
```

`hub.json`:

```json
{
  "title": "Example Hub",
  "description": "Public OES content.",
  "url": "https://example.github.io/hub/",
  "namespace_rule": "github-owner"
}
```

- `url` (optional) is where the site is served; pages show it so people
  can add the hub to an app.
- `namespace_rule`: `github-owner` (the default) requires a package's
  namespace to equal the GitHub owner of its source repository, so nobody
  can publish under someone else's name. `any` turns the rule off, for a
  hub whose maintainers check every namespace themselves.

A package source file, e.g. `packages/acme/databases.yml`:

```yaml
source: https://github.com/acme/databases
path: .                 # the package's folder inside the repo (optional)
versions:
  - tag: v2.1.0
  - tag: v2.0.0
    yanked: Answer key in question 4 was wrong; use 2.1.0.
```

The tagged release must contain an OPK `package.json` whose `name` is
`acme/databases`. Its `version` comes from that manifest, not from the tag.

## Commands

```bash
oes-hub check [hub-dir]               # validate everything; write nothing
oes-hub build [hub-dir] --out _site   # publish new versions to store/, then write the site
```

For each tag not yet in `store/`, both commands clone the release, read
its manifest, compute the file list and digest, lint it, and bundle it.
`build` then writes the version to `store/` and generates the site.

## Rules the generator enforces

- **Published versions never change.** A tag already in `store/` is never
  fetched again, so moving or deleting a tag changes nothing, and a new
  tag carrying an already-published version number is an error.
- **Versions are yanked, not deleted.** Mark a tag `yanked` in its source
  file: the version leaves browsing and `latest`, but its files stay up
  for anyone already using it.
- **The store is checked.** Every stored version's files are re-hashed
  against its manifest and digest on every run, so a hand-edited store
  fails.
- **Invalid content isn't published.** Schema errors, broken references,
  lint errors, missing images and anything a bundle can't contain stop
  the run before anything is written.
- **Every generated hub document is validated** against the OPK schemas
  before it is written.

The site contains `index.json`, `packages/{namespace}/{name}.json`, each
version's `package.json`, `bundle.json` and `files/`, and browse pages
with search. Hidden files (`.git`, `.github`…), `node_modules` and the
manifest itself are not part of a package's files.

## On GitHub

The [hub action](../../.github/actions/hub/action.yml) runs `check` on
pull requests and `build` on `main`:

```yaml
- uses: open-education-standards/oes-tooling/.github/actions/hub@main
  with:
    command: build   # or check
    out: _site
```

A `build` writes new versions to `store/`, so the workflow commits
`store/` back to the repository before deploying `_site` to GitHub Pages.
The [`hub-template`](https://github.com/open-education-standards/hub-template)
repository has the full workflow ready to use.
