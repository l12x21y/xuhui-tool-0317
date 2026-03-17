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
  const out = path.join(outputDir, 'poi-diversity.json');

  // Prefer existing JSON/GeoJSON source files (in repo or public), then fallback to SHP
  const candidates = [
    path.join(rootDir, 'public', 'api', 'data', 'poi-diversity.json'),
    path.join(rootDir, 'poi-diversity.json'),
  ];

  // If there is a POI CSV for the 100m grid, prefer merging it with the grid geojson
  const poiCsv = path.join(rootDir, 'xuhui_100m_poi.csv');
  const gridGeo = path.join(rootDir, 'grid_100m_xh.geojson');

  if (fs.existsSync(poiCsv) && fs.existsSync(gridGeo)) {
    const gridRaw = await fs.promises.readFile(gridGeo, 'utf-8');
    const gridJson = JSON.parse(gridRaw);

    const csvBuffer = await fs.promises.readFile(poiCsv);
    let csvRaw = '';
    try {
      csvRaw = new TextDecoder('gbk').decode(csvBuffer);
    } catch {
      csvRaw = csvBuffer.toString('utf-8');
    }

    const lines = csvRaw.split(/\r?\n/).filter(Boolean);
    if (lines.length <= 1) {
      throw new Error('POI CSV is empty');
    }
    lines.shift();

    const toNum = (v) => {
      const n = Number((v ?? '').toString().trim());
      return Number.isFinite(n) ? n : 0;
    };

    // 列位约定（用户提供格式）：
    // 0:grid_id 1:centroid_lon 2:centroid_lat
    // 3~30 为 14类POI与其 _1 列交替，31:diversity
    const csvMap = new Map();
    for (const line of lines) {
      const cols = line.split(',');
      if (cols.length < 32) continue;
      const gridId = String((cols[0] || '').trim());
      if (!gridId) continue;

      const row = {
        grid_id: gridId,
        centroid_lon: toNum(cols[1]),
        centroid_lat: toNum(cols[2]),

        JTSS: toNum(cols[3]),
        JTSS_1: toNum(cols[4]),
        SHFW: toNum(cols[5]),
        SHFW_1: toNum(cols[6]),
        GSQY: toNum(cols[7]),
        GSQY_1: toNum(cols[8]),
        QCXG: toNum(cols[9]),
        QCXG_1: toNum(cols[10]),
        SWZZ: toNum(cols[11]),
        SWZZ_1: toNum(cols[12]),
        XXYL: toNum(cols[13]),
        XXYL_1: toNum(cols[14]),
        JDZS: toNum(cols[15]),
        JDZS_1: toNum(cols[16]),
        CYMS: toNum(cols[17]),
        CYMS_1: toNum(cols[18]),
        GWXF: toNum(cols[19]),
        GWXF_1: toNum(cols[20]),
        KJWH: toNum(cols[21]),
        KJWH_1: toNum(cols[22]),
        YLBJ: toNum(cols[23]),
        YLBJ_1: toNum(cols[24]),
        LYJD: toNum(cols[25]),
        LYJD_1: toNum(cols[26]),
        YDJS: toNum(cols[27]),
        YDJS_1: toNum(cols[28]),
        JRJG: toNum(cols[29]),
        JRJG_1: toNum(cols[30]),
        diversity: toNum(cols[31]),
      };

      csvMap.set(gridId, row);
    }

    // Merge CSV rows into grid features under properties.poi
    if (Array.isArray(gridJson.features)) {
      for (const feat of gridJson.features) {
        const cell = feat?.properties?.cell_id ?? feat?.properties?.id ?? feat?.id;
        const key = String(cell);
        feat.properties = feat.properties || {};
        if (csvMap.has(key)) {
          const row = csvMap.get(key);
          feat.properties.poi = row;
          feat.properties.centroid_lon = row.centroid_lon;
          feat.properties.centroid_lat = row.centroid_lat;
          feat.properties.JTSS = row.JTSS;
          feat.properties.SHFW = row.SHFW;
          feat.properties.GSQY = row.GSQY;
          feat.properties.QCXG = row.QCXG;
          feat.properties.SWZZ = row.SWZZ;
          feat.properties.XXYL = row.XXYL;
          feat.properties.JDZS = row.JDZS;
          feat.properties.CYMS = row.CYMS;
          feat.properties.GWXF = row.GWXF;
          feat.properties.KJWH = row.KJWH;
          feat.properties.YLBJ = row.YLBJ;
          feat.properties.LYJD = row.LYJD;
          feat.properties.YDJS = row.YDJS;
          feat.properties.JRJG = row.JRJG;
          feat.properties.diversity = row.diversity;
        } else {
          feat.properties.poi = null;
        }
      }
    }

    await writeJson(out, gridJson);
    console.log(`generated: ${path.relative(rootDir, out)} (merged from ${path.relative(rootDir, gridGeo)} + ${path.relative(rootDir, poiCsv)})`);
    return;
  }

  // Next prefer existing JSON/GeoJSON source files (in repo or public), then fallback to grid file
  for (const src of candidates.concat([path.join(rootDir, 'grid_100m_xh.geojson')])) {
    if (fs.existsSync(src)) {
      const raw = await fs.promises.readFile(src, 'utf-8');
      const parsed = JSON.parse(raw);
      await writeJson(out, parsed);
      console.log(`generated: ${path.relative(rootDir, out)} (from ${path.relative(rootDir, src)})`);
      return;
    }
  }

  // Fallback to shapefile if no geojson/json candidate found
  const shp = path.join(rootDir, 'Xuhui_POI_diversity.shp');
  const dbf = path.join(rootDir, 'Xuhui_POI_diversity.dbf');
  if (!fs.existsSync(shp) || !fs.existsSync(dbf)) {
    throw new Error('POI diversity source files not found (checked geojson/json and shp)');
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

async function copyCsvAssets() {
  const csvFiles = [
    'house_grid_100m_xh.csv',
    'Xuhui_streetview_grid_metrics.csv',
    'Xuhui_activity_grid.csv',
    'Xuhui_Road_Network_Data_Fixed.csv',
    'xuhui_100m_poi.csv',
  ];

  for (const fileName of csvFiles) {
    const src = path.join(rootDir, fileName);
    const dest = path.join(rootDir, 'public', fileName);
    if (!fs.existsSync(src)) {
      console.log(`skip: ${fileName} source not found`);
      continue;
    }
    await fs.promises.copyFile(src, dest);
    console.log(`copied: ${path.relative(rootDir, dest)}`);
  }
}

async function main() {
  await ensureDir(outputDir);
  await buildBoundary();
  await buildPoiDiversity();
  await buildRoads();
  await buildMergedAreaIfExists();
  await copyCsvAssets();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
