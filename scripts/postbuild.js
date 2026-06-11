import { copyFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src  = join(ROOT, 'dist', 'index.html')
const dest = join(ROOT, 'FlashCardApp2', 'FlashCard Creator.html')

mkdirSync(join(ROOT, 'FlashCardApp2'), { recursive: true })
copyFileSync(src, dest)
console.log(`✓ Copied dist/index.html → FlashCardApp2/FlashCard Creator.html`)
