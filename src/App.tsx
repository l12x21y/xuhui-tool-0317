import { useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { Map as MapIcon } from 'lucide-react';
import { domToCanvas } from 'modern-screenshot';
import { motion } from 'motion/react';
import { Controls } from './components/Controls';
import { Map as AnalysisMap } from './components/Map';
import {
  FactorBusinessCategory,
  AttractionBaselineByCategory,
  GridData,
  GridMetricRow,
  ImportanceWeightsByCategory,
  MainMode,
  POI_LABELS,
  POICategories,
  SimulationConfig,
  TemporalWeightsPayload,
} from './types';
import { getModeScope } from './services/simulation';
import { correctGeoJSON, ensureLonLatGeoJSON, gcj02ToWgs84 } from './utils/coords';

const defaultWeights: Record<keyof POICategories, number> = {
  CYMS: 1,
  GSQY: 1,
  GWXF: 1,
  JTSS: 1,
  JRJG: 1,
  JDZS: 1,
  KJWH: 1,
  LYJD: 1,
  QCXG: 1,
  SWZZ: 1,
  SHFW: 1,
  XXYL: 1,
  YLBJ: 1,
  YDJS: 1,
};

const modeLabels: Record<MainMode, string> = {
  location: '区位分析',
  traffic: '交通分析',
  heat: '热力分析',
  kde: '核密度分析',
  house_price: '房价分析',
  street_view: '街景分析',
  activity: '活动分析',
  spatial_autocorrelation: '空间自相关',
  mix_degree: '混合度分析',
  cluster_identification: '聚类识别',
  space_syntax: '空间句法',
  grid_score: '网格打分',
  factor_correlation: '因子关联分析',
  flow_prediction: '人流预测模拟',
};

const SIMULATION_DURATION_MAX_DAYS = 90;
const now = new Date();
const CURRENT_MONTH = now.getMonth() + 1;
const CURRENT_WEEKDAY = now.getDay() === 0 ? 7 : now.getDay();

const parseNumeric = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeId = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const num = Number(raw);
  return Number.isFinite(num) ? String(Math.trunc(num)) : raw;
};

const POI_KEYS = Object.keys(defaultWeights) as (keyof POICategories)[];

const FACTOR_CATEGORIES: FactorBusinessCategory[] = [
  'ACGN',
  'Auto',
  'F&B',
  'Public',
  'Star',
  'Lifestyle',
  'Beauty',
  'Culture&Art',
  'Overall',
];

const EMPTY_IMPORTANCE: ImportanceWeightsByCategory = {
  ACGN: {},
  Auto: {},
  'F&B': {},
  Public: {},
  Star: {},
  Lifestyle: {},
  Beauty: {},
  'Culture&Art': {},
  Overall: {},
};

const EMPTY_ATTRACTION: AttractionBaselineByCategory = {
  ACGN: {},
  Auto: {},
  'F&B': {},
  Public: {},
  Star: {},
  Lifestyle: {},
  Beauty: {},
  'Culture&Art': {},
  Overall: {},
};

const OVERALL_BASELINE_WEIGHTS: Record<Exclude<FactorBusinessCategory, 'Overall'>, number> = {
  ACGN: 0.1,
  Auto: 0.08,
  'F&B': 0.22,
  Public: 0.16,
  Star: 0.1,
  Lifestyle: 0.16,
  Beauty: 0.09,
  'Culture&Art': 0.09,
};

const buildEmptyPois = (): POICategories => ({
  CYMS: 0,
  GSQY: 0,
  GWXF: 0,
  JTSS: 0,
  JRJG: 0,
  JDZS: 0,
  KJWH: 0,
  LYJD: 0,
  QCXG: 0,
  SWZZ: 0,
  SHFW: 0,
  XXYL: 0,
  YLBJ: 0,
  YDJS: 0,
});

const parsePoiRows = (csvText: string) => {
  const rows = d3.csvParseRows(csvText).filter((row) => row.length >= 32);
  if (rows.length <= 1) return new Map<string, any>();

  const header = rows[0];
  const body = rows.slice(1);
  const hasCanonicalKeys = header.some((item) => POI_KEYS.includes(String(item).trim() as keyof POICategories));

  const poiById = new Map<string, any>();

  if (hasCanonicalKeys) {
    const parsed = d3.csvParse(csvText);
    for (const row of parsed) {
      const key = normalizeId(row.grid_id ?? row.cell_id ?? row.id);
      if (key) poiById.set(key, row);
    }
    return poiById;
  }

  for (const row of body) {
    const key = normalizeId(row[0]);
    if (!key) continue;

    const baseValue = (baseIndex: number) => parseNumeric(row[baseIndex], 0);

    poiById.set(key, {
      grid_id: key,
      centroid_lon: row[1],
      centroid_lat: row[2],
      JTSS: baseValue(3),
      SHFW: baseValue(5),
      GSQY: baseValue(7),
      QCXG: baseValue(9),
      SWZZ: baseValue(11),
      XXYL: baseValue(13),
      JDZS: baseValue(15),
      CYMS: baseValue(17),
      GWXF: baseValue(19),
      KJWH: baseValue(21),
      YLBJ: baseValue(23),
      LYJD: baseValue(25),
      YDJS: baseValue(27),
      JRJG: baseValue(29),
      diversity: parseNumeric(row[31], 0),
    });
  }

  return poiById;
};

const parseImportanceCsv = (csvText: string) => {
  if (!csvText) return {} as Record<string, number>;
  const rows = d3.csvParse(csvText);
  const result: Record<string, number> = {};
  for (const row of rows) {
    const feature = String(row.feature || '').trim();
    const importance = parseNumeric(row.importance, Number.NaN);
    if (!feature || !Number.isFinite(importance)) continue;
    result[feature] = importance;
  }
  return result;
};

const parseAttractionCsv = (csvText: string) => {
  if (!csvText) return {} as Record<string, number>;
  const rows = d3.csvParse(csvText);
  const result: Record<string, number> = {};
  for (const row of rows) {
    const gridId = normalizeId(row.grid_id ?? row.cell_id ?? row.id);
    const value = parseNumeric(row.A_original ?? row.A ?? row.baseline, Number.NaN);
    if (!gridId || !Number.isFinite(value)) continue;
    result[gridId] = value;
  }
  return result;
};

const buildOverallAttraction = (byCategory: AttractionBaselineByCategory) => {
  const ids = new Set<string>();
  (Object.keys(OVERALL_BASELINE_WEIGHTS) as Array<Exclude<FactorBusinessCategory, 'Overall'>>).forEach((category) => {
    Object.keys(byCategory[category] || {}).forEach((id) => ids.add(id));
  });

  const overall: Record<string, number> = {};
  ids.forEach((id) => {
    let weightedSum = 0;
    let weightSum = 0;

    (Object.keys(OVERALL_BASELINE_WEIGHTS) as Array<Exclude<FactorBusinessCategory, 'Overall'>>).forEach((category) => {
      const value = byCategory[category]?.[id];
      if (!Number.isFinite(value)) return;
      const w = OVERALL_BASELINE_WEIGHTS[category];
      weightedSum += value * w;
      weightSum += w;
    });

    overall[id] = weightSum > 0 ? weightedSum / weightSum : 0;
  });

  return overall;
};

const clonePoiMap = (source: Map<string, any>) => {
  const target = new Map<string, any>();
  source.forEach((row, key) => {
    target.set(key, { ...row });
  });
  return target;
};

const correctPoiCentroids = (source: Map<string, any>) => {
  const target = clonePoiMap(source);
  target.forEach((row) => {
    const lon = parseNumeric(row.centroid_lon, Number.NaN);
    const lat = parseNumeric(row.centroid_lat, Number.NaN);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      const [lonWgs, latWgs] = gcj02ToWgs84(lon, lat);
      row.centroid_lon = lonWgs;
      row.centroid_lat = latWgs;
    }
  });
  return target;
};

const geoPoiAlignmentScore = (gridGeo: any, poiMap: Map<string, any>) => {
  const features = gridGeo?.features || [];
  if (features.length === 0 || poiMap.size === 0) return Number.POSITIVE_INFINITY;

  const distances: number[] = [];

  for (const feature of features) {
    const id = normalizeId(feature?.properties?.cell_id ?? feature?.properties?.grid_id ?? feature?.id);
    if (!id || !poiMap.has(id)) continue;

    const row = poiMap.get(id);
    const lon = parseNumeric(row?.centroid_lon, Number.NaN);
    const lat = parseNumeric(row?.centroid_lat, Number.NaN);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    try {
      const centroid = d3.geoCentroid(feature);
      const dx = centroid[0] - lon;
      const dy = centroid[1] - lat;
      distances.push(Math.sqrt(dx * dx + dy * dy));
    } catch {
    }
  }

  if (distances.length === 0) return Number.POSITIVE_INFINITY;
  distances.sort((a, b) => a - b);
  const median = distances[Math.floor(distances.length / 2)];
  return median;
};

const estimatePoiOffset = (gridGeo: any, poiMap: Map<string, any>) => {
  const features = gridGeo?.features || [];
  const dx: number[] = [];
  const dy: number[] = [];

  for (const feature of features) {
    const id = normalizeId(feature?.properties?.cell_id ?? feature?.properties?.grid_id ?? feature?.id);
    if (!id || !poiMap.has(id)) continue;
    const row = poiMap.get(id);
    const lon = parseNumeric(row?.centroid_lon, Number.NaN);
    const lat = parseNumeric(row?.centroid_lat, Number.NaN);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    try {
      const centroid = d3.geoCentroid(feature);
      dx.push(centroid[0] - lon);
      dy.push(centroid[1] - lat);
    } catch {
    }
  }

  if (dx.length < 10 || dy.length < 10) {
    return { dx: 0, dy: 0, count: 0 };
  }

  dx.sort((a, b) => a - b);
  dy.sort((a, b) => a - b);
  const mid = Math.floor(dx.length / 2);
  return {
    dx: dx[mid],
    dy: dy[mid],
    count: dx.length,
  };
};

const applyPoiOffset = (source: Map<string, any>, offsetX: number, offsetY: number) => {
  const target = clonePoiMap(source);
  target.forEach((row) => {
    const lon = parseNumeric(row.centroid_lon, Number.NaN);
    const lat = parseNumeric(row.centroid_lat, Number.NaN);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      row.centroid_lon = lon + offsetX;
      row.centroid_lat = lat + offsetY;
    }
  });
  return target;
};

const normalizeFeatureCollection = (geo: any) => {
  if (!geo) return null;
  if (geo.type === 'FeatureCollection') return geo;
  if (geo.type === 'Feature') return { type: 'FeatureCollection', features: [geo] };
  return null;
};

const evaluateBoundaryCoverage = (boundary: any, grids: GridData[]) => {
  const collection = normalizeFeatureCollection(boundary);
  if (!collection || !Array.isArray(collection.features) || collection.features.length === 0) return 0;
  if (grids.length === 0) return 0;

  let hit = 0;
  for (const grid of grids) {
    try {
      const centroid = d3.geoCentroid(grid.feature);
      if (d3.geoContains(collection as any, centroid)) {
        hit += 1;
      }
    } catch {
    }
  }
  return hit / grids.length;
};

const pickAlignedBoundary = (rawBoundary: any, grids: GridData[], allowGcjCorrection = true) => {
  if (!rawBoundary) return null;
  const lonLat = ensureLonLatGeoJSON(rawBoundary);
  if (!allowGcjCorrection) return lonLat;
  const corrected = correctGeoJSON(lonLat);

  const rawScore = evaluateBoundaryCoverage(lonLat, grids);
  const correctedScore = evaluateBoundaryCoverage(corrected, grids);

  return correctedScore >= rawScore ? corrected : lonLat;
};

const getGeoBoundsCenter = (geo: any): [number, number] | null => {
  const collection = normalizeFeatureCollection(geo);
  if (!collection || !Array.isArray(collection.features) || collection.features.length === 0) return null;
  try {
    const [[minLng, minLat], [maxLng, maxLat]] = d3.geoBounds(collection as any);
    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
    return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
  } catch {
    return null;
  }
};

const getGeoCentroidSafe = (geo: any): [number, number] | null => {
  const collection = normalizeFeatureCollection(geo);
  if (!collection || !Array.isArray(collection.features) || collection.features.length === 0) return null;
  try {
    const [lng, lat] = d3.geoCentroid(collection as any);
    if ([lng, lat].every(Number.isFinite)) return [lng, lat];
  } catch {
  }
  return getGeoBoundsCenter(collection);
};

const toFeatureCollectionFromGrids = (grids: GridData[]) => ({
  type: 'FeatureCollection',
  features: grids.map((item) => item.feature).filter(Boolean),
});

const estimateBoundaryCenterOffset = (boundary: any, grids: GridData[]) => {
  if (!boundary || grids.length === 0) return { dx: 0, dy: 0, count: 0 };
  const boundaryCenter = getGeoCentroidSafe(boundary);
  if (!boundaryCenter) return { dx: 0, dy: 0, count: 0 };

  const gridCollection = toFeatureCollectionFromGrids(grids);
  const gridCenter = getGeoCentroidSafe(gridCollection);
  if (!gridCenter) return { dx: 0, dy: 0, count: 0 };

  return {
    dx: gridCenter[0] - boundaryCenter[0],
    dy: gridCenter[1] - boundaryCenter[1],
    count: grids.length,
  };
};

const optimizeBoundaryOffsetByCoverage = (
  boundary: any,
  grids: GridData[],
  initialDx: number,
  initialDy: number
) => {
  const evalScore = (dx: number, dy: number) => {
    const shifted = shiftFeatureCollection(boundary, dx, dy);
    return evaluateBoundaryCoverage(shifted, grids);
  };

  let bestDx = initialDx;
  let bestDy = initialDy;
  let bestScore = evalScore(bestDx, bestDy);

  const steps = [0.002, 0.001, 0.0005, 0.0002, 0.0001];
  for (const step of steps) {
    let improved = true;
    while (improved) {
      improved = false;
      const baseDx = bestDx;
      const baseDy = bestDy;

      for (const ox of [-step, 0, step]) {
        for (const oy of [-step, 0, step]) {
          const candDx = baseDx + ox;
          const candDy = baseDy + oy;
          const candScore = evalScore(candDx, candDy);
          if (candScore > bestScore + 1e-9) {
            bestScore = candScore;
            bestDx = candDx;
            bestDy = candDy;
            improved = true;
          }
        }
      }
    }
  }

  return { dx: bestDx, dy: bestDy, score: bestScore };
};

const shiftCoordinates = (coordinates: any, dx: number, dy: number): any => {
  if (!Array.isArray(coordinates)) return coordinates;
  if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    return [coordinates[0] + dx, coordinates[1] + dy];
  }
  return coordinates.map((item) => shiftCoordinates(item, dx, dy));
};

const shiftFeatureCollection = (geo: any, dx: number, dy: number) => {
  const collection = normalizeFeatureCollection(geo);
  if (!collection) return geo;
  return {
    ...collection,
    features: (collection.features || []).map((feature: any) => ({
      ...feature,
      geometry: feature?.geometry
        ? {
            ...feature.geometry,
            coordinates: shiftCoordinates(feature.geometry.coordinates, dx, dy),
          }
        : feature?.geometry,
    })),
  };
};

const buildGridData = (gridGeo: any, poiById: Map<string, any>) => {
  return (gridGeo.features || []).map((feature: any, index: number) => {
    const props = feature?.properties || {};
    const id = normalizeId(props.cell_id ?? props.grid_id ?? feature.id ?? index) || String(index);
    const poi = poiById.get(id) || {};

    const centroid = d3.geoCentroid(feature);
    const x = centroid[0];
    const y = centroid[1];

    const pois = buildEmptyPois();
    for (const key of POI_KEYS) {
      pois[key] = parseNumeric(poi[key], parseNumeric(props[key], 0));
    }

    const baseHeat = POI_KEYS.reduce((sum, key) => sum + pois[key], 0);

    return {
      id,
      x,
      y,
      pois,
      baseHeat,
      feature,
    };
  });
};

export default function App() {
  const [viewMode, setViewMode] = useState<MainMode>('location');
  const [config, setConfig] = useState<SimulationConfig>({
    weights: defaultWeights,
    events: [],
    multiFactorCategories: ['CYMS', 'GWXF', 'SHFW'],
    singleFactorCategory: 'CYMS',
    heatMode: 'overall',
    analysisCategory: 'CYMS',
    factorBusinessCategory: 'Overall',
    flowBusinessCategory: 'Overall',
    flowSelectedGridIds: [],
    flowRadiusMeters: 600,
    flowSelectedFactor: '',
    flowDelta: 30,
    flowCurrentMonth: CURRENT_MONTH,
    flowCurrentWeekday: CURRENT_WEEKDAY,
    flowDraftMonths: [],
    flowDraftWeekdays: [],
    flowTimeBoost: 1.2,
    flowChanges: [],
    isSimulationActive: false,
    simulationStep: 0,
    flowDurationDays: 7,
  });

  const [xuhuiGridData, setXuhuiGridData] = useState<GridData[]>([]);
  const [dxjhGridData, setDxjhGridData] = useState<GridData[]>([]);
  const [xuhuiBoundary, setXuhuiBoundary] = useState<any>(null);
  const [dxjhBoundary, setDxjhBoundary] = useState<any>(null);
  const [housePriceRows, setHousePriceRows] = useState<GridMetricRow[]>([]);
  const [streetViewRows, setStreetViewRows] = useState<GridMetricRow[]>([]);
  const [dxjhMetricRows, setDxjhMetricRows] = useState<GridMetricRow[]>([]);
  const [importanceByCategory, setImportanceByCategory] = useState<ImportanceWeightsByCategory>(EMPTY_IMPORTANCE);
  const [attractionByCategory, setAttractionByCategory] = useState<AttractionBaselineByCategory>(EMPTY_ATTRACTION);
  const [temporalWeights, setTemporalWeights] = useState<TemporalWeightsPayload | null>(null);
  const [selectedGrid, setSelectedGrid] = useState<GridData | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const scope = getModeScope(viewMode);
  const forceDxjhModes: MainMode[] = ['grid_score', 'factor_correlation', 'flow_prediction'];
  const usingDxjhBoundary = scope === 'greater_xujiahui' || forceDxjhModes.includes(viewMode);
  const activeBoundary = usingDxjhBoundary ? dxjhBoundary : xuhuiBoundary;
  const activeGridData = usingDxjhBoundary ? dxjhGridData : xuhuiGridData;

  useEffect(() => {
    if (!config.isSimulationActive) return;
    const timer = setInterval(() => {
      setConfig((prev) => {
        const maxDays = Math.max(1, Math.min(SIMULATION_DURATION_MAX_DAYS, Math.round(prev.flowDurationDays || 1)));
        if (prev.simulationStep >= maxDays) {
          return { ...prev, isSimulationActive: false };
        }
        return { ...prev, simulationStep: prev.simulationStep + 1 };
      });
    }, 500);
    return () => clearInterval(timer);
  }, [config.isSimulationActive]);

  useEffect(() => {
    if (!selectedGrid) return;
    const exists = activeGridData.some((item) => item.id === selectedGrid.id);
    if (!exists) {
      setSelectedGrid(null);
    }
  }, [activeGridData, selectedGrid]);

  useEffect(() => {
    const fetchJsonSafe = async (url: string) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return response.json();
      } catch {
        return null;
      }
    };

    const fetchTextSafe = async (url: string) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return '';
        return response.text();
      } catch {
        return '';
      }
    };

    const load = async () => {
      try {
        const attractionCategories: FactorBusinessCategory[] = ['ACGN', 'Auto', 'F&B', 'Public', 'Star', 'Lifestyle', 'Beauty', 'Culture&Art'];

        const [xuhuiGridResp, dxjhGridResp, poiCsvText, xhBoundaryResp, dxjhBoundaryResp, houseCsv, streetCsv, dxjhMetricsCsv, importanceCsvList, attractionCsvList, timeWeightsResp] = await Promise.all([
          fetchJsonSafe('/api/data/xuhui-grid'),
          fetchJsonSafe('/api/data/dxjh-grid'),
          fetchTextSafe('/api/data/poi'),
          fetchJsonSafe('/api/data/xuhui-boundary'),
          fetchJsonSafe('/api/data/dxjh-boundary'),
          fetchTextSafe('/api/data/house-price'),
          fetchTextSafe('/api/data/street-view'),
          fetchTextSafe('/api/data/dxjh-metrics'),
          Promise.all(FACTOR_CATEGORIES.map((item) => fetchTextSafe(`/api/data/importance/${encodeURIComponent(item)}`))),
          Promise.all(attractionCategories.map((item) => fetchTextSafe(`/api/data/attraction/${encodeURIComponent(item)}`))),
          fetchJsonSafe('/api/data/time-weights'),
        ]);

        const xuhuiGridRaw = xuhuiGridResp || dxjhGridResp;
        const dxjhGridRaw = dxjhGridResp || xuhuiGridResp;
        const xhBoundaryRaw = xhBoundaryResp || dxjhBoundaryResp;
        const dxjhBoundaryRaw = dxjhBoundaryResp || xhBoundaryResp;

        if (!xuhuiGridRaw && !dxjhGridRaw) {
          throw new Error('grid data unavailable');
        }

        const xuhuiGridLonLat = ensureLonLatGeoJSON(xuhuiGridRaw || dxjhGridRaw);
        const xuhuiGridCorrected = correctGeoJSON(xuhuiGridLonLat);

        const poiRaw = parsePoiRows(poiCsvText);
        const poiCorrected = correctPoiCentroids(poiRaw);

        const candidates = [
          { key: 'raw_raw', grid: xuhuiGridLonLat, poi: poiRaw },
          { key: 'corr_raw', grid: xuhuiGridCorrected, poi: poiRaw },
          { key: 'raw_corr', grid: xuhuiGridLonLat, poi: poiCorrected },
          { key: 'corr_corr', grid: xuhuiGridCorrected, poi: poiCorrected },
        ];

        const scored = candidates.map((item) => ({
          ...item,
          score: geoPoiAlignmentScore(item.grid, item.poi),
        }));

        scored.sort((a, b) => a.score - b.score);
        const best = scored[0];

        const useCorrectedGrid = best.key.startsWith('corr_');
        const xuhuiGridGeo = useCorrectedGrid ? xuhuiGridCorrected : xuhuiGridLonLat;
        const dxjhGridLonLat = ensureLonLatGeoJSON(dxjhGridRaw || xuhuiGridRaw);
        const dxjhGridGeo = useCorrectedGrid ? correctGeoJSON(dxjhGridLonLat) : dxjhGridLonLat;
        let poiById = best.poi;

        const offset = estimatePoiOffset(xuhuiGridGeo, poiById);
        const offsetDistance = Math.sqrt(offset.dx * offset.dx + offset.dy * offset.dy);
        if (offset.count > 0 && offsetDistance > 0.00004) {
          poiById = applyPoiOffset(poiById, offset.dx, offset.dy);
          console.info('[coord-detect] apply poi offset', offset);
        }

        const mappedXuhui = buildGridData(xuhuiGridGeo, poiById);
        const mappedDxjh = buildGridData(dxjhGridGeo, poiById);

        const xhBoundary = xhBoundaryRaw ? pickAlignedBoundary(xhBoundaryRaw, mappedXuhui) : null;
        let dxBoundary = dxjhBoundaryRaw ? pickAlignedBoundary(dxjhBoundaryRaw, mappedDxjh, false) : null;

        const boundaryOffset = estimateBoundaryCenterOffset(dxBoundary, mappedDxjh);
        const boundaryOffsetDistance = Math.sqrt(boundaryOffset.dx * boundaryOffset.dx + boundaryOffset.dy * boundaryOffset.dy);
        if (boundaryOffset.count > 0 && boundaryOffsetDistance > 0.00003 && boundaryOffsetDistance < 0.01) {
          const optimized = optimizeBoundaryOffsetByCoverage(dxBoundary, mappedDxjh, boundaryOffset.dx, boundaryOffset.dy);
          dxBoundary = shiftFeatureCollection(dxBoundary, optimized.dx, optimized.dy);
          console.info('[coord-detect] apply dxjh boundary offset', { ...boundaryOffset, optimized });
        }

        console.info('[coord-detect] selected mode:', best.key, 'score:', best.score);

        setXuhuiGridData(mappedXuhui);
        setDxjhGridData(mappedDxjh);
        setXuhuiBoundary(xhBoundary);
        setDxjhBoundary(dxBoundary);
        setHousePriceRows(houseCsv ? (d3.csvParse(houseCsv) as GridMetricRow[]) : []);
        setStreetViewRows(streetCsv ? (d3.csvParse(streetCsv) as GridMetricRow[]) : []);
        setDxjhMetricRows(dxjhMetricsCsv ? (d3.csvParse(dxjhMetricsCsv) as GridMetricRow[]) : []);
        const nextImportance = FACTOR_CATEGORIES.reduce((acc, category, index) => {
          acc[category] = parseImportanceCsv(importanceCsvList[index] || '');
          return acc;
        }, { ...EMPTY_IMPORTANCE } as ImportanceWeightsByCategory);

        const nextAttraction = attractionCategories.reduce((acc, category, index) => {
          acc[category] = parseAttractionCsv(attractionCsvList[index] || '');
          return acc;
        }, { ...EMPTY_ATTRACTION } as AttractionBaselineByCategory);
        nextAttraction.Overall = buildOverallAttraction(nextAttraction);

        setImportanceByCategory(nextImportance);
        setAttractionByCategory(nextAttraction);
        setTemporalWeights(timeWeightsResp || null);
        setConfig((prev) => {
          const currentMap = nextImportance[prev.flowBusinessCategory] || {};
          const topFactor = Object.entries(currentMap).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] || '';
          return {
            ...prev,
            flowSelectedFactor: prev.flowSelectedFactor || topFactor,
            simulationStep: Math.min(prev.simulationStep, Math.max(1, Math.min(SIMULATION_DURATION_MAX_DAYS, Math.round(prev.flowDurationDays || 1)))),
          };
        });
      } catch (error) {
        console.error('Data load failed', error);
      }
    };

    load();
  }, []);

  const selectedGridSummary = useMemo(() => {
    if (!selectedGrid) return null;
    const sorted = Object.entries(selectedGrid.pois)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5)
      .map(([key, value]) => ({
        key,
        label: POI_LABELS[key] || key,
        value,
      }));
    return sorted;
  }, [selectedGrid]);

  const handleExportPng = async () => {
    const target = document.getElementById('analysis-map-container');
    if (!target) return;

    setIsExporting(true);
    try {
      const canvas = await domToCanvas(target, {
        scale: 2,
        backgroundColor: '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `xuhui-analysis-${viewMode}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (error) {
      console.error('PNG 导出失败', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-50 text-slate-900 flex">
      <Controls
        viewMode={viewMode}
        setViewMode={setViewMode}
        config={config}
        setConfig={setConfig}
        onExportPng={handleExportPng}
        isExporting={isExporting}
        importanceByCategory={importanceByCategory}
        temporalWeights={temporalWeights}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-5 border-b border-slate-200 bg-white/90 backdrop-blur flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
              <MapIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold">徐汇 / 大徐家汇 网格分析平台</h1>
              <p className="text-xs text-slate-500">当前模式：{modeLabels[viewMode]}（范围：{usingDxjhBoundary ? '大徐家汇' : '徐汇'}）</p>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            网格数量：{activeGridData.length} | 事件数：{config.events.length}
          </div>
        </header>

        <div id="analysis-map-container" className="flex-1 min-h-0 relative p-2">
          <AnalysisMap
            data={activeGridData}
            scopeBoundary={activeBoundary}
            config={config}
            viewMode={viewMode}
            selectedGridId={selectedGrid?.id}
            onGridClick={(grid) => {
              if (viewMode === 'flow_prediction') {
                setConfig((prev) => {
                  const existed = prev.flowSelectedGridIds.includes(grid.id);
                  return {
                    ...prev,
                    flowSelectedGridIds: existed
                      ? prev.flowSelectedGridIds.filter((id) => id !== grid.id)
                      : [...prev.flowSelectedGridIds, grid.id],
                  };
                });
                setSelectedGrid(grid);
                return;
              }
              setSelectedGrid((prev) => (prev?.id === grid.id ? null : grid));
            }}
            housePriceRows={housePriceRows}
            streetViewRows={streetViewRows}
            dxjhMetricRows={dxjhMetricRows}
            importanceByCategory={importanceByCategory}
            attractionByCategory={attractionByCategory}
            temporalWeights={temporalWeights}
          />

          {selectedGrid && (
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              className="absolute right-4 top-4 w-72 rounded-3xl bg-white/95 backdrop-blur-xl p-4 border border-white/40 shadow-2xl z-[1200]"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">网格统计分析</h3>
                  <p className="text-[10px] font-bold text-slate-400 tracking-widest uppercase">单元 ID: {selectedGrid.id}</p>
                </div>
                <button
                  className="text-xs text-slate-500 px-2 py-1 rounded-lg hover:bg-slate-100"
                  onClick={() => setSelectedGrid(null)}
                >
                  关闭
                </button>
              </div>

              <div className="space-y-2">
                {selectedGridSummary?.map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-500">{item.label}</span>
                    <span className="text-sm font-bold text-indigo-700">{Number(item.value).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
