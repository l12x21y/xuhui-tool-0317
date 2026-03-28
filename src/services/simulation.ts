import * as d3 from 'd3';
import { GridData, POICategories, SimulationConfig, GridMetricRow, ImportanceWeightsByCategory, AttractionBaselineByCategory, TemporalWeightsPayload, FlowChange } from '../types';

const ALL_POI_KEYS = Object.keys(({
  CYMS: 0, GSQY: 0, GWXF: 0, JTSS: 0, JRJG: 0, JDZS: 0, KJWH: 0,
  LYJD: 0, QCXG: 0, SWZZ: 0, SHFW: 0, XXYL: 0, YLBJ: 0, YDJS: 0,
} satisfies POICategories)) as (keyof POICategories)[];

const toNumber = (v: unknown, fallback = 0): number => {
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeId = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const n = Number(raw);
  return Number.isFinite(n) ? String(Math.trunc(n)) : raw;
};

const getGridKeys = (grid: GridData) => [
  normalizeId(grid.id),
  normalizeId(grid.feature?.properties?.cell_id),
  normalizeId(grid.feature?.properties?.grid_id),
].filter(Boolean);

const findMetricRow = (rows: GridMetricRow[], grid: GridData): GridMetricRow | null => {
  const keys = getGridKeys(grid);

  for (const row of rows) {
    const rowId = normalizeId((row.grid_id as string) ?? row.cell_id ?? row.id);
    if (rowId && keys.includes(rowId)) {
      return row;
    }
  }
  return null;
};

const buildMetricRowIndex = (rows: GridMetricRow[]) => {
  const index = new Map<string, GridMetricRow>();
  for (const row of rows) {
    const rowId = normalizeId((row.grid_id as string) ?? row.cell_id ?? row.id);
    if (rowId) index.set(rowId, row);
  }
  return index;
};

const findMetricRowFromIndex = (index: Map<string, GridMetricRow>, grid: GridData): GridMetricRow | null => {
  const keys = getGridKeys(grid);
  for (const key of keys) {
    const row = index.get(key);
    if (row) return row;
  }
  return null;
};

const POI_CN_TO_KEY: Record<string, keyof POICategories> = {
  餐饮美食: 'CYMS',
  公司企业: 'GSQY',
  购物消费: 'GWXF',
  交通设施: 'JTSS',
  金融机构: 'JRJG',
  酒店住宿: 'JDZS',
  科教文化: 'KJWH',
  旅游景点: 'LYJD',
  汽车相关: 'QCXG',
  商务住宅: 'SWZZ',
  生活服务: 'SHFW',
  休闲娱乐: 'XXYL',
  医疗保健: 'YLBJ',
  运动健身: 'YDJS',
};

const normalizeFeatureKey = (key: string) => key.replace(/\s+/g, '').toLowerCase();

const buildRowLookup = (row: GridMetricRow) => {
  const lookup: Record<string, number> = {};
  for (const [k, v] of Object.entries(row)) {
    const num = toNumber(v, Number.NaN);
    if (!Number.isFinite(num)) continue;
    lookup[k] = num;
    lookup[normalizeFeatureKey(k)] = num;
  }
  return lookup;
};

const resolveFeatureValue = (feature: string, rowLookup: Record<string, number>, grid: GridData) => {
  const featureKey = feature.trim();
  const normalized = normalizeFeatureKey(featureKey);

  if (featureKey in rowLookup) return rowLookup[featureKey];
  if (normalized in rowLookup) return rowLookup[normalized];

  const poiFeature = featureKey.endsWith('_1') ? featureKey.slice(0, -2) : featureKey;
  const poiKey = POI_CN_TO_KEY[poiFeature];
  if (poiKey) {
    if (featureKey.endsWith('_1')) {
      const alt = rowLookup[normalizeFeatureKey(featureKey)];
      if (Number.isFinite(alt)) return alt;
    }
    return toNumber(grid.pois[poiKey], 0);
  }

  return 0;
};

const estimateGridStep = (data: GridData[]): number => {
  if (data.length < 2) return 0.001;
  const sample = Math.min(data.length, 100);
  let sum = 0;
  let count = 0;

  for (let i = 0; i < sample; i += 1) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let j = 0; j < data.length; j += 1) {
      if (i === j) continue;
      const dx = data[i].x - data[j].x;
      const dy = data[i].y - data[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0 && dist < nearest) nearest = dist;
    }
    if (Number.isFinite(nearest)) {
      sum += nearest;
      count += 1;
    }
  }

  if (count === 0) return 0.001;
  return sum / count;
};

const buildCrossNeighbors = (data: GridData[]): number[][] => {
  const step = estimateGridStep(data) * 1.8;
  return data.map((cell, index) => {
    const candidates = data
      .map((other, otherIndex) => {
        if (index === otherIndex) return null;
        const dx = other.x - cell.x;
        const dy = other.y - cell.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > step) return null;
        return { otherIndex, dx, dy, absDx, absDy, dist };
      })
      .filter(Boolean) as Array<{ otherIndex: number; dx: number; dy: number; absDx: number; absDy: number; dist: number }>;

    const pick = (dir: 'up' | 'down' | 'left' | 'right') => {
      const list = candidates.filter((c) => {
        if (dir === 'up') return c.dy > 0 && c.absDy >= c.absDx;
        if (dir === 'down') return c.dy < 0 && c.absDy >= c.absDx;
        if (dir === 'left') return c.dx < 0 && c.absDx >= c.absDy;
        return c.dx > 0 && c.absDx >= c.absDy;
      });
      list.sort((a, b) => a.dist - b.dist);
      return list[0]?.otherIndex;
    };

    return [pick('up'), pick('down'), pick('left'), pick('right')].filter((v): v is number => Number.isInteger(v));
  });
};

export const getModeScope = (mode: string) => {
  if (mode === 'grid_score' || mode === 'factor_correlation' || mode === 'flow_prediction') {
    return 'greater_xujiahui' as const;
  }
  return 'xuhui' as const;
};

export const calculateHeatValues = (data: GridData[], config: SimulationConfig): number[] => {
  const events = config.isSimulationActive ? config.events : [];

  return data.map((grid) => {
    const activePois = { ...grid.pois };
    for (const event of events) {
      if (event.gridId !== grid.id) continue;
      const current = activePois[event.category] || 0;
      const progress = Math.max(0, Math.min(1, (config.simulationStep || 0) / 10));
      activePois[event.category] = Math.max(0, current + event.intensity * progress);
    }

    if (config.heatMode === 'single') {
      return activePois[config.singleFactorCategory || 'CYMS'] || 0;
    }

    if (config.heatMode === 'multi') {
      return config.multiFactorCategories.reduce((sum, key) => sum + (activePois[key] || 0), 0);
    }

    return ALL_POI_KEYS.reduce((sum, key) => sum + (activePois[key] || 0), 0);
  });
};

export const calculateKdeCross = (values: number[], data: GridData[]): number[] => {
  if (data.length === 0 || values.length !== data.length) return [];
  const neighbors = buildCrossNeighbors(data);
  return values.map((v, i) => {
    const local = neighbors[i].map((idx) => values[idx] ?? 0);
    const weightedSelf = v * 0.4;
    const weightedNeighbors = d3.sum(local) * 0.15;
    return weightedSelf + weightedNeighbors;
  });
};

export const calculateGlobalMoran = (values: number[], data: GridData[]): number => {
  if (values.length < 2 || values.length !== data.length) return 0;

  const neighbors = buildCrossNeighbors(data);
  const mean = d3.mean(values) || 0;

  let numerator = 0;
  let denominator = 0;
  let weightSum = 0;

  for (let i = 0; i < values.length; i += 1) {
    const zi = values[i] - mean;
    denominator += zi * zi;

    for (const j of neighbors[i]) {
      const zj = values[j] - mean;
      numerator += zi * zj;
      weightSum += 1;
    }
  }

  if (denominator === 0 || weightSum === 0) return 0;
  return (values.length / weightSum) * (numerator / denominator);
};

export const calculateMixDegree = (data: GridData[]): number[] => {
  return data.map((grid) => {
    const counts = ALL_POI_KEYS.map((key) => grid.pois[key] || 0);
    const total = d3.sum(counts);
    if (total <= 0) return 0;

    let entropy = 0;
    for (const c of counts) {
      if (c <= 0) continue;
      const p = c / total;
      entropy -= p * Math.log(p);
    }
    const maxEntropy = Math.log(ALL_POI_KEYS.length);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  });
};

export const calculateClusterIdentification = (values: number[]): number[] => {
  if (values.length === 0) return [];
  const quantiles = d3.scaleQuantile<number, number>()
    .domain(values)
    .range([0, 1, 2, 3]);
  return values.map((v) => quantiles(v));
};

export const calculateHousePrice = (data: GridData[], rows: GridMetricRow[]): number[] => {
  return data.map((grid) => {
    const row = findMetricRow(rows, grid);
    if (!row) return 0;
    return toNumber(row['小区均价'] ?? row.house_price ?? row.avg_price ?? row.price, 0);
  });
};

export const calculateStreetView = (data: GridData[], rows: GridMetricRow[]): number[] => {
  return data.map((grid) => {
    const row = findMetricRow(rows, grid);
    if (!row) return 0;
    const green = toNumber(row.green_view, 0);
    const walkability = toNumber(row.walkability, 0);
    return green * 0.6 + walkability * 0.4;
  });
};

export const calculateGridScore = (
  data: GridData[],
  rows: GridMetricRow[],
  importanceWeights: Record<string, number>
): number[] => {
  const entries = Object.entries(importanceWeights || {}).filter(([, weight]) => Number.isFinite(Number(weight)));
  if (entries.length === 0) return emptyValues(data.length);

  const rowIndex = buildMetricRowIndex(rows);
  const rowLookupCache = new Map<string, Record<string, number>>();

  return data.map((grid) => {
    const row = findMetricRowFromIndex(rowIndex, grid);
    const rowId = row ? normalizeId((row.grid_id as string) ?? row.cell_id ?? row.id) : '';
    let rowLookup: Record<string, number> = {};
    if (row && rowId) {
      const cached = rowLookupCache.get(rowId);
      if (cached) {
        rowLookup = cached;
      } else {
        rowLookup = buildRowLookup(row);
        rowLookupCache.set(rowId, rowLookup);
      }
    }

    let score = 0;
    for (const [feature, weightRaw] of entries) {
      const weight = toNumber(weightRaw, 0);
      const value = resolveFeatureValue(feature, rowLookup, grid);
      score += weight * value;
    }
    return score;
  });
};

const distanceMeters = (a: GridData, b: GridData) => {
  const avgLat = ((a.y + b.y) / 2) * Math.PI / 180;
  const dx = (a.x - b.x) * 111320 * Math.cos(avgLat);
  const dy = (a.y - b.y) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
};

const FLOW_TIME_RESPONSE_SCALE_DAYS = 5;
const FLOW_EFFECT_AMPLIFICATION = 0.38;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const deriveScenarioTemporal = (stepDays: number, startMonth: number, startWeekday: number) => {
  const safeStep = Math.max(0, Math.round(stepDays));
  const safeMonth = clamp(Math.round(startMonth || 1), 1, 12);
  const safeWeekday = clamp(Math.round(startWeekday || 1), 1, 7);

  const month = ((safeMonth - 1 + Math.floor(safeStep / 30)) % 12) + 1;
  const weekday = ((safeWeekday - 1 + safeStep) % 7) + 1;

  return { month, weekday };
};

const deriveScenarioTemporalAtDay = (dayIndex: number, startMonth: number, startWeekday: number) => {
  const safeDay = Math.max(0, Math.round(dayIndex));
  const safeMonth = clamp(Math.round(startMonth || 1), 1, 12);
  const safeWeekday = clamp(Math.round(startWeekday || 1), 1, 7);

  const month = ((safeMonth - 1 + Math.floor(safeDay / 30)) % 12) + 1;
  const weekday = ((safeWeekday - 1 + safeDay) % 7) + 1;
  return { month, weekday };
};

const getTemporalDataMultiplier = (
  temporalWeights: TemporalWeightsPayload | null | undefined,
  category: string,
  month: number,
  weekday: number
) => {
  if (!temporalWeights?.weightsByCategory) return 1;
  const weightsByCategory = temporalWeights.weightsByCategory as Record<string, any>;
  const profile = weightsByCategory[category];

  if (!profile && category === 'Overall') {
    const entries = Object.values(weightsByCategory || {});
    if (entries.length === 0) return 1;

    let weightedSum = 0;
    let weightSum = 0;
    for (const item of entries) {
      const monthMultiplier = toNumber(item?.monthMultipliers?.[String(month)], 1);
      const weekdayMultiplier = toNumber(item?.weekdayMultipliers?.[String(weekday)], 1);
      const categoryMultiplier = toNumber(item?.categoryMultiplier, 1);
      const combined = clamp(monthMultiplier * weekdayMultiplier * categoryMultiplier, 0.2, 8);
      const weight = Math.max(0.01, Math.abs(toNumber(item?.categoryMultiplier, 1)));

      weightedSum += combined * weight;
      weightSum += weight;
    }

    return weightSum > 0 ? clamp(weightedSum / weightSum, 0.2, 8) : 1;
  }

  if (!profile) return 1;

  const monthMultiplier = toNumber(profile.monthMultipliers?.[String(month)], 1);
  const weekdayMultiplier = toNumber(profile.weekdayMultipliers?.[String(weekday)], 1);
  const categoryMultiplier = toNumber(profile.categoryMultiplier, 1);

  return clamp(monthMultiplier * weekdayMultiplier * categoryMultiplier, 0.2, 8);
};

const getCumulativeTemporalBoost = (
  elapsedDays: number,
  startMonth: number,
  startWeekday: number,
  change: FlowChange,
  temporalWeights: TemporalWeightsPayload | null,
) => {
  const safeDays = Math.max(1, Math.round(elapsedDays));
  let boostSum = 0;

  for (let day = 0; day < safeDays; day += 1) {
    const { month, weekday } = deriveScenarioTemporalAtDay(day, startMonth, startWeekday);
    const monthScore = change.activeMonths.length === 0
      ? 1
      : (change.activeMonths.includes(month) ? 1 : 0.35);
    const weekdayScore = change.activeWeekdays.length === 0
      ? 1
      : (change.activeWeekdays.includes(weekday) ? 1 : 0.45);
    const temporalSuitability = (monthScore + weekdayScore) / 2;
    const temporalDataMultiplier = getTemporalDataMultiplier(temporalWeights, change.businessCategory, month, weekday);
    const dailyBoost = temporalDataMultiplier * (1 + (toNumber(change.timeBoost, 1) - 1) * temporalSuitability);
    boostSum += dailyBoost;
  }

  return boostSum / safeDays;
};

export const calculateFlowPrediction = (
  data: GridData[],
  rows: GridMetricRow[],
  importanceByCategory: ImportanceWeightsByCategory,
  attractionByCategory: AttractionBaselineByCategory,
  temporalWeights: TemporalWeightsPayload | null,
  config: SimulationConfig
): number[] => {
  const normalizeGridId = (grid: GridData) =>
    normalizeId(grid.id)
    || normalizeId(grid.feature?.properties?.cell_id)
    || normalizeId(grid.feature?.properties?.grid_id);

  const attractionMap = attractionByCategory[config.flowBusinessCategory] || {};
  const hasAttraction = Object.keys(attractionMap).length > 0;

  const baseScores = hasAttraction
    ? data.map((grid) => {
        const gridId = normalizeGridId(grid);
        return toNumber(attractionMap[gridId], 0);
      })
    : calculateGridScore(data, rows, importanceByCategory[config.flowBusinessCategory] || {});

  if (data.length === 0 || config.flowChanges.length === 0) return baseScores;

  const step = Math.max(0, config.simulationStep || 0);
  if (step <= 0) return baseScores;

  const maxDays = Math.max(1, Math.round(config.flowDurationDays || 1));
  const timeResponse = (1 - Math.exp(-step / FLOW_TIME_RESPONSE_SCALE_DAYS)) * (step / maxDays);

  const gridById = new Map<string, GridData>();
  for (const grid of data) {
    gridById.set(normalizeId(grid.id), grid);
    gridById.set(normalizeId(grid.feature?.properties?.cell_id), grid);
    gridById.set(normalizeId(grid.feature?.properties?.grid_id), grid);
  }

  const scores = [...baseScores];
  const positiveBase = baseScores.filter((value) => value > 0);
  const baseP75 = d3.quantile(positiveBase, 0.75) || 0;
  const baselineFloor = Math.max(1, baseP75 * 0.25);

  for (const change of config.flowChanges) {
    const weights = importanceByCategory[change.businessCategory] || {};
    const factorWeightRaw = toNumber(weights[change.factor], 1);
    const maxFactorWeight = Math.max(
      ...Object.values(weights || {}).map((value) => Math.abs(toNumber(value, 0))),
      0,
    );
    const normalizedFactorWeight = maxFactorWeight > 0
      ? clamp(Math.abs(factorWeightRaw) / maxFactorWeight, 0.1, 1)
      : 1;
    const factorEffect = 0.5 + normalizedFactorWeight * 1.5;
    const targetGrids = change.gridIds
      .map((id) => gridById.get(normalizeId(id)))
      .filter(Boolean) as GridData[];

    if (targetGrids.length === 0) continue;
    const radius = Math.max(1, change.radiusMeters || 0);

    const temporalBoost = getCumulativeTemporalBoost(
      step,
      config.flowCurrentMonth,
      config.flowCurrentWeekday,
      change,
      temporalWeights,
    );

    data.forEach((grid, index) => {
      let influenceSum = 0;
      for (const target of targetGrids) {
        const d = distanceMeters(grid, target);
        if (d > radius) continue;
        const distanceRatio = clamp(d / radius, 0, 1);
        influenceSum += Math.pow(1 - distanceRatio, 1.6);
      }

      if (influenceSum <= 0) return;

      const influenceRatio = clamp(influenceSum / Math.max(1, targetGrids.length), 0, 1);

      const baselineA = Math.max(0, baseScores[index] || 0);
      const effectiveBaseline = Math.max(baselineA, baselineFloor);
      const deltaFlow = effectiveBaseline * influenceRatio * factorEffect * temporalBoost * timeResponse;
      const scaled = change.delta >= 0
        ? deltaFlow * Math.abs(change.delta) / 100 * FLOW_EFFECT_AMPLIFICATION
        : -deltaFlow * Math.abs(change.delta) / 100 * FLOW_EFFECT_AMPLIFICATION;
      scores[index] += scaled;
    });
  }

  return scores;
};

export const emptyValues = (size: number) => Array.from({ length: size }, () => 0);
