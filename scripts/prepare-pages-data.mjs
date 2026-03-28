import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as shapefile from 'shapefile';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'api', 'data');

const ensureDir = async (dir) => {
  await fs.promises.mkdir(dir, { recursive: true });
};

const readShp = async (shpPath, dbfPath) => {
  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });
  const features = [];
  let item;
  while (!(item = await source.read()).done) {
    features.push(item.value);
  }
  return { type: 'FeatureCollection', features };
};

const writeJson = async (name, value) => {
  const target = path.join(outDir, name);
  await fs.promises.writeFile(target, JSON.stringify(value), 'utf-8');
  console.log(`generated: public/api/data/${name}`);
};

const copyCsv = async (name) => {
  const from = path.join(root, name);
  if (!fs.existsSync(from)) return;
  const to = path.join(outDir, name);
  await fs.promises.copyFile(from, to);
  console.log(`copied: public/api/data/${name}`);
};

const main = async () => {
  await ensureDir(outDir);

  const xhBoundaryJson = path.join(root, '徐汇区边界', '310104.json');
  if (fs.existsSync(xhBoundaryJson)) {
    const parsed = JSON.parse(await fs.promises.readFile(xhBoundaryJson, 'utf-8'));
    await writeJson('xuhui-boundary.json', parsed);
  }

  const xhBoundaryShp = path.join(root, '徐汇区边界', '310104.shp');
  const xhBoundaryDbf = path.join(root, '徐汇区边界', '310104.dbf');
  if (!fs.existsSync(xhBoundaryJson) && fs.existsSync(xhBoundaryShp) && fs.existsSync(xhBoundaryDbf)) {
    await writeJson('xuhui-boundary.json', await readShp(xhBoundaryShp, xhBoundaryDbf));
  }

  const dxjhShp = path.join(root, '大徐家汇边界', 'merged_area_clean.shp');
  const dxjhDbf = path.join(root, '大徐家汇边界', 'merged_area_clean.dbf');
  if (fs.existsSync(dxjhShp) && fs.existsSync(dxjhDbf)) {
    await writeJson('dxjh-boundary.json', await readShp(dxjhShp, dxjhDbf));
  }

  const gridPath = path.join(root, '徐汇区100m网格.geojson');
  if (fs.existsSync(gridPath)) {
    const parsed = JSON.parse(await fs.promises.readFile(gridPath, 'utf-8'));
    await writeJson('xuhui-grid.json', parsed);
  }

  await copyCsv('徐汇-POI.csv');
  await copyCsv('徐汇-房价.csv');
  await copyCsv('徐汇-街景.csv');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
