#!/usr/bin/env node
/**
 * dsgvo-check.js
 *
 * Automated DSGVO compliance scanner for Steuerpilot.
 * Exits with code 1 if any violation is found.
 *
 * Run: node scripts/dsgvo-check.js
 *
 * WHY THIS EXISTS:
 * Under DSGVO Art. 6 and LG München I (Az. 3 O 17493/20), loading any asset
 * from a third-party CDN transmits the user's IP address to that third party
 * without consent. This creates legal liability. This script catches violations
 * before they reach production.
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const BANNED_CDN_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdn.skypack.dev',
  'esm.sh',
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'plausible.io',
  'mixpanel.com',
  'segment.io',
  'hotjar.com',
  'clarity.ms',
  'doubleclick.net',
  'facebook.net',
  'connect.facebook.net',
]

const BANNED_NPM_PACKAGES = [
  'google-analytics',
  'react-ga',
  'react-ga4',
  'mixpanel-browser',
  'analytics-node',
  'hotjar',
]

let violations = []
let checksRun = 0

function fail(file, line, pattern, message) {
  violations.push({ file, line, pattern, message })
}

function walkFiles(dir, extensions, callback) {
  if (!existsSync(dir)) return
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
      walkFiles(fullPath, extensions, callback)
    } else if (entry.isFile()) {
      const ext = entry.name.split('.').pop()
      if (extensions.includes(ext)) callback(fullPath)
    }
  }
}

function checkSourceFiles() {
  checksRun++
  console.log('\n[1/4] Scanning client source files for external CDN references...')
  let filesScanned = 0

  walkFiles(join(ROOT, 'client'), ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss'], (filePath) => {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    filesScanned++
    lines.forEach((line, idx) => {
      for (const pattern of BANNED_CDN_PATTERNS) {
        if (line.includes(pattern)) {
          fail(filePath.replace(ROOT, '.'), idx + 1, pattern,
            `External CDN reference: "${pattern}" — self-host this asset instead`)
        }
      }
    })
  })

  console.log(`   Scanned ${filesScanned} files.`)
}

function checkBuiltOutput() {
  checksRun++
  console.log('\n[2/4] Scanning built output (client/dist)...')
  const distDir = join(ROOT, 'client', 'dist')
  if (!existsSync(distDir)) {
    console.log('   SKIP: client/dist not found (run npm run build first for full check)')
    return
  }

  walkFiles(distDir, ['html', 'js', 'css'], (filePath) => {
    const content = readFileSync(filePath, 'utf8')
    const lines = content.split('\n')
    lines.forEach((line, idx) => {
      if (/<script[^>]+src=["']https?:\/\//i.test(line) ||
          /<link[^>]+href=["']https?:\/\//i.test(line)) {
        for (const pattern of BANNED_CDN_PATTERNS) {
          if (line.includes(pattern)) {
            fail(filePath.replace(ROOT, '.'), idx + 1, pattern,
              `Built HTML contains external asset tag: "${pattern}"`)
          }
        }
      }
    })
  })
}

function checkPackageJson() {
  checksRun++
  console.log('\n[3/4] Scanning package.json files for banned analytics packages...')
  const packageFiles = [
    join(ROOT, 'package.json'),
    join(ROOT, 'client', 'package.json'),
    join(ROOT, 'server', 'package.json'),
  ]

  for (const pkgPath of packageFiles) {
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const depName of Object.keys(allDeps)) {
      for (const banned of BANNED_NPM_PACKAGES) {
        if (depName === banned || depName.startsWith(banned)) {
          fail(pkgPath.replace(ROOT, '.'), null, depName,
            `Banned analytics/tracking package: "${depName}"`)
        }
      }
    }
  }
}

function checkIndexHtml() {
  checksRun++
  console.log('\n[4/4] Scanning index.html for CDN links...')
  const htmlFiles = [
    join(ROOT, 'client', 'index.html'),
    join(ROOT, 'client', 'public', 'index.html'),
  ]

  for (const htmlPath of htmlFiles) {
    if (!existsSync(htmlPath)) continue
    const content = readFileSync(htmlPath, 'utf8')
    const lines = content.split('\n')
    lines.forEach((line, idx) => {
      for (const pattern of BANNED_CDN_PATTERNS) {
        if (line.includes(pattern)) {
          fail(htmlPath.replace(ROOT, '.'), idx + 1, pattern,
            `index.html contains external CDN reference: "${pattern}"`)
        }
      }
    })
  }
}

console.log('═══════════════════════════════════════════════════')
console.log('  Steuerpilot — DSGVO Compliance Check')
console.log('  Legal basis: DSGVO Art. 6, LG München I Az. 3 O 17493/20')
console.log('═══════════════════════════════════════════════════')

checkSourceFiles()
checkBuiltOutput()
checkPackageJson()
checkIndexHtml()

console.log('\n───────────────────────────────────────────────────')
console.log(`Checks run: ${checksRun}`)

if (violations.length === 0) {
  console.log('\n✓ DSGVO check passed — no external CDN violations found.\n')
  process.exit(0)
} else {
  console.log(`\n✗ DSGVO check FAILED — ${violations.length} violation(s):\n`)
  for (const v of violations) {
    const loc = v.line ? `:${v.line}` : ''
    console.log(`  VIOLATION  ${v.file}${loc}`)
    console.log(`             ${v.message}`)
    console.log()
  }
  console.log('Fix all violations before committing or deploying.')
  console.log('See CLAUDE.md for guidance.\n')
  process.exit(1)
}
