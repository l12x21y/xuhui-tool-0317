import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as shapefile from 'shapefile';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const outputDir = path.join(rootDir, 'public', 'api', 'data');

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function readShapefileAsGeoJSON(shpPath, dbfPath) {
  const features = [];
  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });
  let result;
  while (!(result = await source.read()).done) {
    features.push(result.value);
  }
  return {
    type: 'FeatureCollection',
    features,
  };
}

async function writeJson(targetPath, data) {
  await fs.promises.writeFile(targetPath, JSON.stringify(data), 'utf-8');
  console.log(`generated: ${path.relative(rootDir, targetPath)}`);
}

async function buildBoundary() {
  const boundaryJson = path.join(rootDir, '310104.json');
  const out = path.join(outputDir, 'boundary.json');

  if (fs.existsSync(boundaryJson)) {
    const raw = await fs.promises.readFile(boundaryJson, 'utf-8');
    await fs.promises.writeFile(out, raw, 'utf-8');
    console.log(`generated: ${path.relative(rootDir, out)} (from 310104.json)`);
    return;
  }

  const shp = path.join(rootDir, '310104.shp');
  const dbf = path.join(rootDir, '310104.dbf');
  if (!fs.existsSync(shp) || !fs.existsSync(dbf)) {
    throw new Error('Boundary source files not found');
  }

  const geojson = await readShapefileAsGeoJSON(shp, dbf);
  await writeJson(out, geojson);
}

async function buildPoiDiversity() {
  const shp = path.join(rootDir, 'Xuhui_POI_diversity.shp');
  const dbf = path.join(rootDir, 'Xuhui_POI_diversity.dbf');
  const out = path.join(outputDir, 'poi-diversity.json');

  if (!fs.existsSync(shp) || !fs.existsSync(dbf)) {
    throw new Error('POI diversity source files not found');
  }

  const geojson = await readShapefileAsGeoJSON(shp, dbf);
  await writeJson(out, geojson);
}

async function buildRoads() {
  const roadDir = path.join(rootDir, 'road');
  const roadFiles = [
    'shanghai_roads_nw_part1.json',
    'shanghai_roads_nw_part2.json',
    'shanghai_roads_nw_part3.json',
  ];
  const out = path.join(outputDir, 'roads.json');

  const features = [];
  for (const fileName of roadFiles) {
    const filePath = path.join(roadDir, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const json = JSON.parse(raw);
    if (Array.isArray(json?.features)) {
      features.push(...json.features);
    }
  }

  if (features.length === 0) {
    throw new Error('Road source files not found or empty');
  }

  await writeJson(out, {
    type: 'FeatureCollection',
    features,
  });
}

async function buildMergedAreaIfExists() {
  const geojsonPath = path.join(rootDir, 'merge_shp', 'merged_area84.geojson');
  const shpPath = path.join(rootDir, 'merge_shp', 'merged_area84.shp');
  const dbfPath = path.join(rootDir, 'merge_shp', 'merged_area84.dbf');
  const out = path.join(outputDir, 'merged-area.json');

  if (fs.existsSync(geojsonPath)) {
    const raw = await fs.promises.readFile(geojsonPath, 'utf-8');
    await fs.promises.writeFile(out, raw, 'utf-8');
    console.log(`generated: ${path.relative(rootDir, out)} (from merged_area84.geojson)`);
    return;
  }

  if (fs.existsSync(shpPath) && fs.existsSync(dbfPath)) {
    const geojson = await readShapefileAsGeoJSON(shpPath, dbfPath);
    await writeJson(out, geojson);
    return;
  }

  console.log('skip: merged area source not found');
}

async function main() {
  await ensureDir(outputDir);
  await buildBoundary();
  await buildPoiDiversity();
  await buildRoads();
  await buildMergedAreaIfExists();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
