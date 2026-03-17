import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

async function copyIfExists(srcRel, destRel) {
  const src = path.join(root, srcRel);
  const dest = path.join(root, destRel);
  try {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    if (fs.existsSync(src)) {
      await fs.promises.copyFile(src, dest);
      console.log(`copied: ${destRel}`);
    } else {
      console.log(`skip (not found): ${srcRel}`);
    }
  } catch (err) {
    console.error(`error copying ${srcRel} -> ${destRel}:`, err);
  }
}

async function main() {
  await copyIfExists('grid_100m_xh.geojson', 'public/api/data/grid_100m_xh.geojson');

  // copy road parts
  const roadDir = path.join(root, 'road');
  if (fs.existsSync(roadDir)) {
    const files = await fs.promises.readdir(roadDir);
    for (const f of files) {
      if (f.endsWith('.json')) {
        await copyIfExists(path.join('road', f), path.join('public', 'api', 'data', f));
      }
    }
  }

  // copy merged area geojson
  await copyIfExists(path.join('merge_shp', 'merged_area84.geojson'), path.join('public', 'api', 'data', 'merged_area84.geojson'));
}

main();
