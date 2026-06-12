import { copyFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src  = join(ROOT, 'dist', 'index.html')
const dest = String.raw`G:\My Drive\01_PROJECTS\M1 - CardApp\FlashCardApp\app\FlashCard Creator.html`

mkdirSync(String.raw`G:\My Drive\01_PROJECTS\M1 - CardApp\FlashCardApp\app`, { recursive: true })
copyFileSync(src, dest)
console.log(String.raw`✓ Copied dist/index.html → G:\My Drive\01_PROJECTS\M1 - CardApp\FlashCardApp\app\FlashCard Creator.html`)
