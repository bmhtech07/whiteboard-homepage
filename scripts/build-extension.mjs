// Turns Nuxt's static output (.output/public) into a loadable Chrome extension in dist/.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, '.output/public')
const out = join(root, 'dist')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Public half of an RSA key generated once for this project. Pinning it keeps the
// extension ID (and so the chrome.storage area holding your board) the same no
// matter where the folder lives. The private key is not needed for unpacked use.
const EXTENSION_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAslnxipqC1y1dcNFnmGsFevjuJe7PXLT20IMgSBQ3TxNNXlI0Y1NJnas0MMei7Bvm/ytrD7bi0LxJWxNOV/iv8KnnZb3OMYUqrHKTcBSSCYEwoVnn522ZpL6sawT0aWohQuVNE0aTxDmnrG9Jf399bU30RYbziY06+F+jB0QiaDiJ/rOwJQuIG0lWqcFxl1lJpdC4HWapFFJtzZmgsjXbwQOO6VvU48W58flfViA2oh09V/1Icr6IPMd1y/Wg5D9daHXdtdomJg304N9Ic4IDWTurhdfn9zY9Z6jUf9+HkGeHNeBow1jLtcW26ncgZZ+ZYqtJZ/IDs6FGmF4lfTTp7QIDAQAB'

const manifest = {
  manifest_version: 3,
  name: 'Whiteboard Tab',
  short_name: 'Whiteboard',
  description: pkg.description,
  version: pkg.version,
  key: EXTENSION_KEY,
  chrome_url_overrides: { newtab: 'index.html' },
  // "favicon" lets the page ask the browser for its own new-tab icon (the Chrome or
  // Brave logo) via the _favicon endpoint, so the tab looks like the built-in one.
  permissions: ['storage', 'unlimitedStorage', 'favicon'],
  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
}

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

if (!existsSync(join(src, 'index.html'))) fail('No .output/public/index.html — run "nuxt generate" first.')

rmSync(out, { recursive: true, force: true })
cpSync(src, out, { recursive: true })
for (const file of ['200.html', '404.html']) rmSync(join(out, file), { force: true })

// Extension pages may only run scripts from files ("script-src 'self'"), so every
// inline <script> Nuxt emits is moved into its own file. JSON data blocks are inert
// and can stay.
let html = readFileSync(join(out, 'index.html'), 'utf8')
let count = 0
html = html.replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g, (tag, attrs = '', body) => {
  if (/\bsrc=/.test(attrs) || /type="application\/json"/.test(attrs) || !body.trim()) return tag
  if (/type="importmap"/.test(attrs)) fail('Inline import map found; set experimental.entryImportMap = false.')
  const name = count ? `boot-${count}.js` : 'boot.js'
  count++
  writeFileSync(join(out, name), body)
  return `<script src="/${name}"></script>`
})
writeFileSync(join(out, 'index.html'), html)
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

// Sanity checks for things Chrome would reject when loading the extension.
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? [full, ...walk(full)] : [full]
  })
}
const files = walk(out)
const reserved = files.filter((f) => relative(out, f).split('/').some((part) => part.startsWith('_')))
if (reserved.length) fail(`Chrome rejects paths starting with "_": ${reserved.map((f) => relative(out, f)).join(', ')}`)
for (const icon of Object.values(manifest.icons)) {
  if (!existsSync(join(out, icon))) fail(`Missing icon ${icon}; run "npm run icons".`)
}
const leftover = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(
  ([, attrs = '', body]) => !/\bsrc=/.test(attrs) && !/application\/json/.test(attrs) && body.trim(),
)
if (leftover.length) fail('index.html still contains inline scripts.')

const id = createHash('sha256')
  .update(Buffer.from(EXTENSION_KEY, 'base64'))
  .digest('hex')
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)))

const kb = Math.round(files.reduce((sum, f) => sum + (statSync(f).isFile() ? statSync(f).size : 0), 0) / 1024)
console.log(`\n✔ Extension built in dist/ (${files.length} files, ${kb} KB, ${count} inline script(s) externalised)`)
console.log(`  Extension ID: ${id}`)
console.log('  Load it from chrome://extensions → Developer mode → Load unpacked → select the dist folder.\n')
