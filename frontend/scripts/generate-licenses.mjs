// Generate THIRD-PARTY-NOTICES.txt for the code the frontend bundle ships.
// Adapted from PCB Colour-Plan's scripts/generate-licenses.mjs.
//
// Permissive licences (MIT/BSD/ISC/Apache-2.0) require preserving their
// copyright and licence text in distributions. Vite emits none, so we collect
// them here. Run as part of `npm run build`; the file is written to the repo
// root and into dist/, so the server publishes it beside the bundle.
//
// Walks runtime `dependencies`, following each package's own dependencies and
// resolving through node_modules the way Node does. `svelte` is seeded by hand:
// it is a devDependency, but its runtime is compiled into the bundle.
// Following it over-includes its compiler dependencies, which is harmless;
// missing a shipped licence is not.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '..')
const BUNDLED_DEV_DEPENDENCIES = ['svelte']

const LICENSE_FILENAMES = [
  'LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'license.txt',
  'LICENCE', 'LICENCE.md', 'LICENSE-MIT', 'LICENSE-MIT.txt', 'COPYING', 'COPYING.md',
]

/** Find a package's directory from `fromDir`, walking up node_modules like Node. */
function findPkgDir(name, fromDir) {
  let dir = fromDir
  for (;;) {
    const pj = join(dir, 'node_modules', name, 'package.json')
    if (existsSync(pj)) return dirname(pj)
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function readLicenseText(dir) {
  for (const f of LICENSE_FILENAMES) {
    const p = join(dir, f)
    if (existsSync(p)) return readFileSync(p, 'utf8').trim()
  }
  return null
}

function licenseId(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license === 'object') return pkg.license.type ?? 'UNKNOWN'
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type).join(' OR ')
  return 'UNKNOWN'
}

const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const queue = [...Object.keys(rootPkg.dependencies ?? {}), ...BUNDLED_DEV_DEPENDENCIES].map(
  (name) => ({ name, from: root }),
)
const seen = new Set()
const collected = []

while (queue.length) {
  const { name, from } = queue.shift()
  if (seen.has(name)) continue
  seen.add(name)

  const dir = findPkgDir(name, from)
  if (!dir) {
    console.warn(`[licenses] could not resolve ${name}; skipping`)
    continue
  }
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  collected.push({
    name: pkg.name ?? name,
    version: pkg.version ?? '',
    license: licenseId(pkg),
    text: readLicenseText(dir),
  })
  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies }
  for (const dep of Object.keys(deps)) queue.push({ name: dep, from: dir })
}

collected.sort((a, b) => a.name.localeCompare(b.name))

const header = `THIRD-PARTY SOFTWARE NOTICES
============================

This product bundles the following third-party packages. Each is distributed
under its own licence, reproduced below. Generated from the frontend's
dependency tree by frontend/scripts/generate-licenses.mjs.

Packages (${collected.length}):
${collected.map((p) => `  - ${p.name}@${p.version} (${p.license})`).join('\n')}

`

const body = collected
  .map((p) => {
    const bar = '-'.repeat(76)
    const license = p.text ?? `(No bundled licence file found. SPDX: ${p.license}.)`
    return `${bar}\n${p.name}@${p.version} - ${p.license}\n${bar}\n\n${license}\n`
  })
  .join('\n')

const out = header + body
const targets = [join(repoRoot, 'THIRD-PARTY-NOTICES.txt')]
if (existsSync(join(root, 'dist'))) targets.push(join(root, 'dist', 'THIRD-PARTY-NOTICES.txt'))
for (const t of targets) writeFileSync(t, out)

console.log(
  `[licenses] wrote notices for ${collected.length} packages to:\n${targets.map((t) => '  ' + t).join('\n')}`,
)
