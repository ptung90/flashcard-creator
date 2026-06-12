import { copyFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src  = join(ROOT, 'dist', 'index.html')
const dest = join(ROOT, 'FlashCardApp', 'FlashCard Creator.html')

mkdirSync(join(ROOT, 'FlashCardApp'), { recursive: true })
copyFileSync(src, dest)
console.log(`✓ Copied dist/index.html → FlashCardApp/FlashCard Creator.html`)
