import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

const DIST_DIRECTORY = 'dist'
const CLOUDFLARE_FILE_LIMIT = 25 * 1024 * 1024

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  }))
  return nested.flat()
}

const files = await listFiles(DIST_DIRECTORY)
const sizes = await Promise.all(files.map(async (path) => ({ path, size: (await stat(path)).size })))
const oversized = sizes.filter(({ size }) => size > CLOUDFLARE_FILE_LIMIT)
const largest = sizes.toSorted((left, right) => right.size - left.size).slice(0, 5)

console.log(`Cloudflare Pages 检查：${files.length} 个文件`)
for (const { path, size } of largest) {
  console.log(`- ${relative(DIST_DIRECTORY, path)}：${size.toLocaleString('en-US')} bytes`)
}

if (oversized.length) {
  for (const { path, size } of oversized) {
    console.error(`超过 25 MiB：${relative(DIST_DIRECTORY, path)}（${size} bytes）`)
  }
  process.exitCode = 1
} else {
  console.log('检查通过：所有 Pages 静态文件均不超过 25 MiB。')
}
