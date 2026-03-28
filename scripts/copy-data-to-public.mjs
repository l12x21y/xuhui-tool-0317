import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const copyMap = [
  ['徐汇区100m网格.geojson', 'public/data/徐汇区100m网格.geojson'],
  ['大徐家汇100m网格.geojson', 'public/data/大徐家汇100m网格.geojson'],
  ['徐汇-POI.csv', 'public/data/徐汇-POI.csv'],
  ['徐汇-房价.csv', 'public/data/徐汇-房价.csv'],
  ['徐汇-街景.csv', 'public/data/徐汇-街景.csv'],
  ['徐汇区边界/310104.json', 'public/data/徐汇区边界/310104.json'],
];

const copyIfExists = async (fromRel, toRel) => {
  const from = path.join(root, fromRel);
  const to = path.join(root, toRel);
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  if (!fs.existsSync(from)) {
    console.log(`skip: ${fromRel}`);
    return;
  }
  await fs.promises.copyFile(from, to);
  console.log(`copied: ${toRel}`);
};

const copyRoads = async () => {
  const roadDir = path.join(root, '路网');
  if (!fs.existsSync(roadDir)) return;
  const files = await fs.promises.readdir(roadDir);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    await copyIfExists(path.join('路网', file), path.join('public', 'data', '路网', file));
  }
};

const copyDxjhBoundary = async () => {
  const dxjh = path.join(root, '大徐家汇边界');
  if (!fs.existsSync(dxjh)) return;
  const files = await fs.promises.readdir(dxjh);
  for (const file of files) {
    if (!file.startsWith('merged_area_clean')) continue;
    await copyIfExists(path.join('大徐家汇边界', file), path.join('public', 'data', '大徐家汇边界', file));
  }
};

const main = async () => {
  for (const [from, to] of copyMap) {
    await copyIfExists(from, to);
  }
  await copyRoads();
  await copyDxjhBoundary();
};

main();
