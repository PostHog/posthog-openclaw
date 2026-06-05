import { rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const stripDotSlash = (path) => path.replace(/^\.\//, '')

function fail(message) {
    console.error(`[pack:verify] ${message}`)
    process.exitCode = 1
}

function assert(condition, message) {
    if (!condition) {
        fail(message)
    }
}

const extensions = pkg.openclaw?.extensions ?? []
const runtimeExtensions = pkg.openclaw?.runtimeExtensions ?? []

assert(pkg.main === './dist/index.js', 'package.json main must point to compiled runtime JS')
assert(pkg.types === './dist/index.d.ts', 'package.json types must point to compiled declarations')
assert(Array.isArray(extensions) && extensions.length > 0, 'openclaw.extensions must declare at least one entry')
assert(
    Array.isArray(runtimeExtensions) && runtimeExtensions.length === extensions.length,
    'openclaw.runtimeExtensions must have one runtime entry for each source extension'
)

for (const runtimeExtension of runtimeExtensions) {
    assert(
        typeof runtimeExtension === 'string' && runtimeExtension.endsWith('.js'),
        `runtime extension must be compiled JS: ${runtimeExtension}`
    )
}

if (process.exitCode) {
    process.exit(process.exitCode)
}

const pack = spawnSync('npm', ['pack', '--json', '--ignore-scripts'], {
    encoding: 'utf8',
    env: {
        ...process.env,
        npm_config_cache: join(tmpdir(), 'posthog-openclaw-npm-cache'),
    },
})

if (pack.status !== 0) {
    console.error(pack.stderr)
    process.exit(pack.status ?? 1)
}

let packed
try {
    packed = JSON.parse(pack.stdout)
} catch (error) {
    console.error(pack.stdout)
    console.error(pack.stderr)
    throw error
}

const artifact = packed[0]
const files = new Set(artifact.files.map((file) => file.path))
const runtimeSupportFiles = ['dist/src/plugin.js', 'dist/src/events.js', 'dist/src/utils.js', 'dist/src/version.js']
const requiredFiles = [
    'package.json',
    'openclaw.plugin.json',
    stripDotSlash(pkg.main),
    stripDotSlash(pkg.types),
    ...runtimeSupportFiles,
    ...extensions.map(stripDotSlash),
    ...runtimeExtensions.map(stripDotSlash),
]

for (const file of requiredFiles) {
    assert(files.has(file), `packed artifact is missing ${file}`)
}

for (const file of files) {
    assert(!file.endsWith('.test.ts'), `packed artifact should not include test source: ${file}`)
    assert(!file.endsWith('.test.js'), `packed artifact should not include compiled tests: ${file}`)
}

await rm(artifact.filename, { force: true })

if (process.exitCode) {
    process.exit(process.exitCode)
}

console.log(`[pack:verify] verified ${artifact.filename} includes compiled runtime output`)
