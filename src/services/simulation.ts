import { GridData, SimulationConfig, POICategories } from "../types";
import * as d3 from 'd3';

function getNumeric(row: any, keys: string[], fallback = 0): number {
  if (!row) return fallback;
  for (const key of keys) {
    const value = parseFloat(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

/**
 * Calculates the average POI count for each category across all grid cells.
 */
export function calculatePOIAverages(data: GridData[]): Record<string, number> {
  if (!data || data.length === 0) return {};
  
  const sums: Record<string, number> = {};
  data.forEach(d => {
    Object.entries(d.pois).forEach(([cat, val]) => {
      sums[cat] = (sums[cat] || 0) + val;
    });
  });
  
  const avgs: Record<string, number> = {};
  Object.keys(sums).forEach(cat => {
    avgs[cat] = sums[cat] / data.length;
  });
  
  return avgs;
}

/**
 * Calculates the simulated heat for a grid cell based on POI weights and events.
 */
export function calculateHeat(grid: GridData, config: SimulationConfig, filterCategories?: (keyof POICategories)[], averages?: Record<string, number>): number {
  const { weights, events, isSimulationActive, simulationStep } = config;
  
  // Create a copy of POIs to modify (Virtual POIs)
  const virtualPois = { ...grid.pois };

  if (isSimulationActive && events.length > 0) {
    events.forEach(event => {
      if (!event.category) return;

      const scope = event.scope || 'grid';
      const effect = event.effect || 'add';
      const progress = Math.max(0, Math.min(1, (simulationStep || 0) / 10));

      let applies = false;
      let impact = 1;

      if (scope === 'global') {
        applies = true;
      } else if (scope === 'grid' && event.gridId) {
        applies = event.gridId === grid.id;
      } else {
        const dx = grid.x - event.x;
        const dy = grid.y - event.y;
        const distance = Math.sqrt(dx * dx + dy * dy) * 111320;
        const radius = Math.max(1, event.radius || 1);

        if (scope === 'region') {
          if (distance <= radius) {
            applies = true;
            impact = 1 - 0.35 * (distance / radius);
          }
        } else {
          if (distance < radius) {
            applies = true;
            const sigma = radius / 2;
            impact = Math.exp(-(distance * distance) / (2 * sigma * sigma));
          } else if (distance < radius * 3) {
            applies = true;
            impact = 0.2 * (1 - (distance - radius) / (radius * 2));
          }
        }
      }

      if (!applies) return;

      const current = virtualPois[event.category] || 0;
      if (effect === 'percent') {
        const pct = Math.max(-99, event.intensity) / 100;
        const ratio = 1 + pct * progress * impact;
        virtualPois[event.category] = Math.max(0, current * ratio);
      } else {
        const avg = (averages && averages[event.category]) || 1;
        const addedPois = avg * (event.intensity / 10) * progress * impact;
        virtualPois[event.category] = Math.max(0, current + addedPois);
      }
    });
  }

  // Base heat from POIs (including virtual ones)
  let heat = 0;
  Object.entries(virtualPois).forEach(([key, count]) => {
    // If filterCategories is provided, only include those categories
    if (filterCategories && !filterCategories.includes(key as keyof POICategories)) {
      return;
    }
    
    const weight = weights[key as keyof POICategories] || 1;
    heat += count * weight;
  });

  return Math.max(0, heat);
}

/**
 * Calculates flow direction for each grid cell based on heat gradients.
 * Returns an array of [vx, vy] vectors.
 */
export function calculateFlow(data: GridData[], config: SimulationConfig): [number, number][] {
  const averages = calculatePOIAverages(data);
  
  // 1. Calculate heat for all cells first
  const heatMap = new Map<string, number>();
  data.forEach(d => {
    let heat = 0;
    if (config.flowSubMode === 'custom_formula') {
      const { traffic, commercial, purchasing, youth } = config.customFormula;
      const customWeights = {
        ...config.weights,
        JTSS: traffic,
        CYMS: commercial,
        JDZS: commercial,
        GWXF: purchasing,
        XXYL: youth,
        YDJS: youth
      };
      const flowConfig: SimulationConfig = {
        ...config,
        weights: customWeights
      };
      // 保留全类别贡献，避免模拟时出现“其他类别被删掉”导致的全局低热力突变
      heat = calculateHeat(d, flowConfig, undefined, averages);
    } else {
      // ML Driven - use a specific set of weights or importance
      const categories: (keyof POICategories)[] = ['CYMS', 'GWXF', 'XXYL', 'JTSS', 'SWZZ'];
      heat = calculateHeat(d, config, categories, averages);
    }
    heatMap.set(d.id, heat);
  });

  // 2. Find a reasonable distance threshold for neighbors
  const sampleSize = Math.min(data.length, 100);
  let minDistance = 1.0;
  if (data.length > 1) {
    let sumMinDist = 0;
    for (let i = 0; i < sampleSize; i++) {
      let dMin = Infinity;
      const di = data[i];
      for (let j = 0; j < data.length; j++) {
        if (i === j) continue;
        const dj = data[j];
        const dist = Math.sqrt((di.x - dj.x)**2 + (di.y - dj.y)**2);
        if (dist > 0 && dist < dMin) dMin = dist;
      }
      if (dMin !== Infinity) sumMinDist += dMin;
    }
    minDistance = (sumMinDist / sampleSize) * 2.5; // Increased search radius for smoother flow
  }

  // 3. Find neighbors and calculate gradient
  return data.map(d => {
    const neighbors = data.filter(n => {
      const dist = Math.sqrt((n.x - d.x)**2 + (n.y - d.y)**2);
      return dist > 0 && dist <= minDistance;
    });

    let vx = 0;
    let vy = 0;
    const currentHeat = heatMap.get(d.id) || 0;

    neighbors.forEach(n => {
      const nHeat = heatMap.get(n.id) || 0;
      const diff = nHeat - currentHeat;
      
      const dx = n.x - d.x;
      const dy = n.y - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 0) {
        // Flow points towards higher heat
        const weight = 1 / (dist * dist); // Inverse distance weighting
        vx += (dx / dist) * diff * weight;
        vy += (dy / dist) * diff * weight;
      }
    });

    // Normalize or scale the vector for visualization
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > 0) {
      // Apply a non-linear scaling to make small flows visible but large flows not overwhelming
      const scaledMag = Math.log1p(mag * 100) / 10;
      vx = (vx / mag) * scaledMag;
      vy = (vy / mag) * scaledMag;
    }

    return [vx, vy];
  });
}

/**
 * Calculates aggregation potential based on local heat density and convergence.
 */
export function calculateAggregation(data: GridData[], config: SimulationConfig): number[] {
  const categories = config.aggregationCategories;
  const averages = calculatePOIAverages(data);
  const heatValues = data.map(d => calculateHeat(d, config, categories, averages));
  
  // Find a reasonable distance threshold for neighbors
  const sampleSize = Math.min(data.length, 100);
  let minDistance = 1.0;
  if (data.length > 1) {
    let sumMinDist = 0;
    for (let i = 0; i < sampleSize; i++) {
      let dMin = Infinity;
      const di = data[i];
      for (let j = 0; j < data.length; j++) {
        if (i === j) continue;
        const dj = data[j];
        const dist = Math.sqrt((di.x - dj.x)**2 + (di.y - dj.y)**2);
        if (dist > 0 && dist < dMin) dMin = dist;
      }
      if (dMin !== Infinity) sumMinDist += dMin;
    }
    minDistance = (sumMinDist / sampleSize) * 1.5;
  }

  // Aggregation is where heat is high AND it's a local maximum or near one
  return data.map((d, i) => {
    const h = heatValues[i];
    const neighbors = data.filter(n => {
      const dist = Math.sqrt((n.x - d.x)**2 + (n.y - d.y)**2);
      return dist > 0 && dist <= minDistance;
    });

    const isLocalMax = neighbors.every(n => {
      const nIdx = data.indexOf(n);
      return h >= heatValues[nIdx];
    });

    return isLocalMax ? h * 1.5 : h * 0.5;
  });
}

/**
 * Calculates Functional Mixedness using Shannon Entropy.
 * H = -sum(pi * ln(pi))
 */
export function calculateEntropy(data: GridData[], config: SimulationConfig): number[] {
  const categories = config.entropyCategories || Object.keys(data[0].pois) as (keyof POICategories)[];
  
  return data.map(d => {
    let total = 0;
    const counts = categories.map(cat => {
      const val = d.pois[cat] || 0;
      const weight = config.weights[cat] || 1;
      const weightedVal = val * weight;
      total += weightedVal;
      return weightedVal;
    });

    if (total === 0) return 0;

    let entropy = 0;
    counts.forEach(count => {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log(p);
      }
    });

    // Normalize by max possible entropy (ln(N))
    const maxEntropy = Math.log(categories.length);
    return entropy / (maxEntropy || 1);
  });
}

/**
 * Calculates Global Moran's I.
 */
export function calculateGlobalMoran(data: GridData[], config: SimulationConfig, categories?: (keyof POICategories)[]): number {
  const values = data.map(d => calculateHeat(d, config, categories));
  const n = values.length;
  const mean = d3.mean(values) || 0;
  
  let numerator = 0;
  let denominator = 0;
  let totalWeight = 0;

  // Find a reasonable distance threshold for neighbors
  const sampleSize = Math.min(data.length, 100);
  let minDistance = 1.0;
  if (data.length > 1) {
    let sumMinDist = 0;
    for (let i = 0; i < sampleSize; i++) {
      let dMin = Infinity;
      const di = data[i];
      for (let j = 0; j < data.length; j++) {
        if (i === j) continue;
        const dj = data[j];
        const dist = Math.sqrt((di.x - dj.x)**2 + (di.y - dj.y)**2);
        if (dist > 0 && dist < dMin) dMin = dist;
      }
      if (dMin !== Infinity) sumMinDist += dMin;
    }
    minDistance = (sumMinDist / sampleSize) * 1.5;
  }

  // Build adjacency list using a simple grid-based spatial partition for O(N) neighbor search
  const gridSize = minDistance;
  const spatialMap = new Map<string, number[]>();
  
  data.forEach((d, i) => {
    const gx = Math.floor(d.x / gridSize);
    const gy = Math.floor(d.y / gridSize);
    const key = `${gx},${gy}`;
    if (!spatialMap.has(key)) spatialMap.set(key, []);
    spatialMap.get(key)!.push(i);
  });

  for (let i = 0; i < n; i++) {
    const xi = values[i] - mean;
    denominator += xi * xi;

    const di = data[i];
    const gx = Math.floor(di.x / gridSize);
    const gy = Math.floor(di.y / gridSize);

    // Check 3x3 grid neighborhood
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const key = `${gx + ox},${gy + oy}`;
        const cellNeighbors = spatialMap.get(key);
        if (cellNeighbors) {
          cellNeighbors.forEach(j => {
            if (i === j) return;
            const dj = data[j];
            const dist = Math.sqrt((di.x - dj.x)**2 + (di.y - dj.y)**2);
            
            if (dist > 0 && dist <= minDistance) {
              const xj = values[j] - mean;
              numerator += xi * xj;
              totalWeight += 1;
            }
          });
        }
      }
    }
  }

  if (denominator === 0 || totalWeight === 0) return 0;
  return (n / totalWeight) * (numerator / denominator);
}

/**
 * Calculates Local Moran's I (LISA).
 * Returns an array of local I values.
 */
export function calculateLISA(data: GridData[], config: SimulationConfig): number[] {
  const categories = config.lisaCategories;
  const values = data.map(d => calculateHeat(d, config, categories));
  const n = values.length;
  const mean = d3.mean(values) || 0;
  const variance = d3.variance(values) || 1;

  // Find a reasonable distance threshold for neighbors
  const sampleSize = Math.min(data.length, 100);
  let minDistance = 1.0;
  if (data.length > 1) {
    let sumMinDist = 0;
    for (let i = 0; i < sampleSize; i++) {
      let dMin = Infinity;
      const di = data[i];
      for (let j = 0; j < data.length; j++) {
        if (i === j) continue;
        const dj = data[j];
        const dist = Math.sqrt((di.x - dj.x)**2 + (di.y - dj.y)**2);
        if (dist > 0 && dist < dMin) dMin = dist;
      }
      if (dMin !== Infinity) sumMinDist += dMin;
    }
    minDistance = (sumMinDist / sampleSize) * 1.5;
  }

  // Build adjacency list using a simple grid-based spatial partition for O(N) neighbor search
  const gridSize = minDistance;
  const spatialMap = new Map<string, number[]>();
  
  data.forEach((d, i) => {
    const gx = Math.floor(d.x / gridSize);
    const gy = Math.floor(d.y / gridSize);
    const key = `${gx},${gy}`;
    if (!spatialMap.has(key)) spatialMap.set(key, []);
    spatialMap.get(key)!.push(i);
  });

  return data.map((di, i) => {
    const xi = values[i] - mean;
    let neighborSum = 0;
    let weightSum = 0;

    const gx = Math.floor(di.x / gridSize);
    const gy = Math.floor(di.y / gridSize);

    // Check 3x3 grid neighborhood
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const key = `${gx + ox},${gy + oy}`;
        const cellNeighbors = spatialMap.get(key);
        if (cellNeighbors) {
          cellNeighbors.forEach(j => {
            if (i === j) return;
            const dj = data[j];
            const dist = Math.sqrt((di.x - dj.x)**2 + (di.y - dj.y)**2);
            
            if (dist > 0 && dist <= minDistance) {
              neighborSum += (values[j] - mean);
              weightSum += 1;
            }
          });
        }
      }
    }

    if (weightSum === 0) return 0;
    return (xi / variance) * neighborSum;
  });
}

/**
 * Identifies crowd clusters using a simplified DBSCAN.
 */
export function calculateDBSCAN(data: GridData[], config: SimulationConfig): number[] {
  const categories = config.dbscanCategories;
  const heatValues = data.map(d => calculateHeat(d, config, categories));
  const threshold = d3.mean(heatValues) || 0;
  
  // Only consider points above threshold
  const activeIndices = data.map((_, i) => i).filter(i => heatValues[i] > threshold);
  const clusters = new Array(data.length).fill(-1);
  let clusterId = 0;
  const visited = new Set<number>();

  const eps = 0.015; // Distance threshold
  const minPts = 2;

  activeIndices.forEach(idx => {
    if (visited.has(idx)) return;
    visited.add(idx);

    const neighbors = activeIndices.filter(nIdx => {
      const dx = data[idx].x - data[nIdx].x;
      const dy = data[idx].y - data[nIdx].y;
      return Math.sqrt(dx * dx + dy * dy) <= eps;
    });

    if (neighbors.length < minPts) {
      clusters[idx] = 0; // Noise
    } else {
      clusterId++;
      clusters[idx] = clusterId;
      
      let queue = [...neighbors.filter(n => n !== idx)];
      queue.forEach(qIdx => {
        if (!visited.has(qIdx)) {
          visited.add(qIdx);
          const qNeighbors = activeIndices.filter(nIdx => {
            const dx = data[qIdx].x - data[nIdx].x;
            const dy = data[qIdx].y - data[nIdx].y;
            return Math.sqrt(dx * dx + dy * dy) <= eps;
          });
          if (qNeighbors.length >= minPts) {
            queue.push(...qNeighbors.filter(n => !visited.has(n)));
          }
        }
        if (clusters[qIdx] <= 0) {
          clusters[qIdx] = clusterId;
        }
      });
    }
  });

  return clusters;
}

/**
 * Generates mock grid data for Xuhui (simplified representation)
 */
export function generateMockGrid(rows: number, cols: number): GridData[] {
  const data: GridData[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      data.push({
        id: `grid-${i * cols + j}`, // Use grid- prefix consistently
        x: j,
        y: i,
        pois: {
          CYMS: Math.random() * 5,
          GSQY: Math.random() * 5,
          GWXF: Math.random() * 5,
          JTSS: Math.random() * 5,
          JRJG: Math.random() * 5,
          JDZS: Math.random() * 5,
          KJWH: Math.random() * 5,
          LYJD: Math.random() * 5,
          QCXG: Math.random() * 5,
          SWZZ: Math.random() * 5,
          SHFW: Math.random() * 5,
          XXYL: Math.random() * 5,
          YLBJ: Math.random() * 5,
          YDJS: Math.random() * 5
        },
        baseHeat: 0
      });
    }
  }
  return data;
}

/**
 * Calculates Kernel Density Estimation for multiple POI categories
 * Updated: Now uses a 5-point neighborhood (self + 4 neighbors) as requested
 */
export function calculateKDE(data: GridData[], config: SimulationConfig): number[] {
  const categories = config.kdeCategories || [];
  if (categories.length === 0) {
    return data.map(() => 0);
  }

  // 1. Calculate base weighted values for each grid
  const baseValues = data.map(d => {
    let val = 0;
    categories.forEach(cat => {
      val += (d.pois[cat] || 0) * (config.weights[cat] || 1);
    });
    
    // Add event influence
    if (config.isSimulationActive) {
      config.events.forEach(event => {
        if (event.category && categories.includes(event.category)) {
          const dx = d.x - event.x;
          const dy = d.y - event.y;
          const dist = Math.sqrt(dx * dx + dy * dy) * 111320;
          if (dist < event.radius) {
            const sigma = event.radius / 2;
            const impact = event.intensity * Math.exp(-(dist * dist) / (2 * sigma * sigma));
            const progress = (config.simulationStep || 0) / 10;
            val += impact * 5 * progress;
          }
        }
      });
    }
    return val;
  });

  // 2. Apply 5-point neighborhood smoothing (Self + Up, Down, Left, Right)
  // We need to find neighbors based on x, y coordinates
  const gridMap = new Map<string, number>();
  data.forEach((d, i) => gridMap.set(`${d.x},${d.y}`, baseValues[i]));

  return data.map(d => {
    const self = baseValues[data.indexOf(d)];
    const up = gridMap.get(`${d.x},${d.y + 1}`) || 0;
    const down = gridMap.get(`${d.x},${d.y - 1}`) || 0;
    const left = gridMap.get(`${d.x - 1},${d.y}`) || 0;
    const right = gridMap.get(`${d.x + 1},${d.y}`) || 0;
    
    // Weighted sum: center has more weight, neighbors contribute
    return self + 0.5 * (up + down + left + right);
  });
}

/**
 * Calculates Space Syntax metrics (Connectivity, Integration, Choice).
 * Mimics depthmapx functionality.
 */
export function calculateSpaceSyntax(data: GridData[], config: SimulationConfig): number[] {
  const subMode = config.spaceSyntaxSubMode;
  const n = data.length;
  
  // Find a reasonable distance threshold for neighbors
  const sampleSize = Math.min(data.length, 100);
  let minDistance = 1.0;
  if (data.length > 1) {
    let sumMinDist = 0;
    for (let i = 0; i < sampleSize; i++) {
      let dMin = Infinity;
      const di = data[i];
      for (let j = 0; j < data.length; j++) {
        if (i === j) continue;
        const dj = data[j];
        const dist = Math.sqrt((di.x - dj.x)**2 + (di.y - dj.y)**2);
        if (dist > 0 && dist < dMin) dMin = dist;
      }
      if (dMin !== Infinity) sumMinDist += dMin;
    }
    minDistance = (sumMinDist / sampleSize) * 1.5;
  }

  // Build adjacency list
  const adj = data.map((d, i) => {
    return data.map((n, j) => {
      if (i === j) return false;
      const dist = Math.sqrt((n.x - d.x)**2 + (n.y - d.y)**2);
      return dist > 0 && dist <= minDistance;
    }).map((isNeighbor, j) => isNeighbor ? j : -1).filter(j => j !== -1);
  });

  if (subMode === 'connectivity') {
    return adj.map(neighbors => neighbors.length);
  }

  if (subMode === 'integration') {
    // Closeness Centrality (Integration)
    // For large grids, we use a limited radius BFS to speed up
    const maxRadius = 10; 
    return data.map((_, startNode) => {
      let totalDist = 0;
      let reachableCount = 0;
      const distances = new Array(n).fill(-1);
      const queue = [startNode];
      distances[startNode] = 0;

      let head = 0;
      while (head < queue.length) {
        const u = queue[head++];
        if (distances[u] >= maxRadius) continue;

        adj[u].forEach(v => {
          if (distances[v] === -1) {
            distances[v] = distances[u] + 1;
            totalDist += distances[v];
            reachableCount++;
            queue.push(v);
          }
        });
      }
      return reachableCount > 0 ? (reachableCount / totalDist) : 0;
    });
  }

  if (subMode === 'choice') {
    // Betweenness Centrality (Choice) - Simplified
    const choice = new Array(n).fill(0);
    const sampleNodes = data.length > 200 ? 50 : n;
    const step = Math.floor(n / sampleNodes);

    for (let i = 0; i < n; i += step) {
      const distances = new Array(n).fill(-1);
      const predecessors: number[][] = Array.from({ length: n }, () => []);
      const sigma = new Array(n).fill(0);
      const queue = [i];
      const stack = [];
      distances[i] = 0;
      sigma[i] = 1;

      let head = 0;
      while (head < queue.length) {
        const v = queue[head++];
        stack.push(v);
        adj[v].forEach(w => {
          if (distances[w] === -1) {
            distances[w] = distances[v] + 1;
            queue.push(w);
          }
          if (distances[w] === distances[v] + 1) {
            sigma[w] += sigma[v];
            predecessors[w].push(v);
          }
        });
      }

      const delta = new Array(n).fill(0);
      while (stack.length > 0) {
        const w = stack.pop()!;
        predecessors[w].forEach(v => {
          delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
        });
        if (w !== i) choice[w] += delta[w];
      }
    }
    return choice;
  }

  return data.map(() => 0);
}

/**
 * Analyzes house price data.
 */
export function calculateHousePriceAnalysis(data: GridData[], config: SimulationConfig, gridMetrics: any[]): number[] {
  const subMode = config.housePriceSubMode;
  
  // Use grid metrics if available for specific sub-modes
  if (gridMetrics && gridMetrics.length > 0) {
    if (subMode === 'price') return gridMetrics.map(m => getNumeric(m, ['小区均价', 'house_price', 'avg_price', 'price'], 0));
    if (subMode === 'area') return gridMetrics.map(m => getNumeric(m, ['总建面', 'total_area', 'area'], 0));
    if (subMode === 'plot_ratio') return gridMetrics.map(m => getNumeric(m, ['容积率', 'plot_ratio', 'far'], 0));
    if (subMode === 'green_ratio') return gridMetrics.map(m => getNumeric(m, ['绿化率', 'green_ratio'], 0));
  }

  return data.map(() => 0);
}

/**
 * Analyzes street view data.
 */
export function calculateStreetViewAnalysis(data: GridData[], config: SimulationConfig, gridMetrics: any[]): number[] {
  const subMode = config.streetViewSubMode;
  
  // Use grid metrics if available
  if (gridMetrics && gridMetrics.length > 0) {
    if (subMode === 'green_view') return gridMetrics.map(m => parseFloat(m.green_view || 0));
    if (subMode === 'sky_view') return gridMetrics.map(m => parseFloat(m.sky_view || 0));
    if (subMode === 'continuity') return gridMetrics.map(m => parseFloat(m.interface_continuity || 0));
    if (subMode === 'walkability') return gridMetrics.map(m => parseFloat(m.walkability || 0));
    if (subMode === 'traffic') return gridMetrics.map(m => parseFloat(m.traffic_pressure || 0));
    if (subMode === 'activity') return gridMetrics.map(m => parseFloat(m.street_activity || 0));
  }

  return data.map(() => 0);
}

/**
 * Analyzes activity data.
 */
export function calculateActivityAnalysis(data: GridData[], config: SimulationConfig, activityGridData: any[]): number[] {
  if (!activityGridData || activityGridData.length === 0) return data.map(() => 0);
  return activityGridData.map(m => getNumeric(m, ['activity_count', 'activity_account', 'activity'], 0));
}

/**
 * Calculates factor importance using various statistical methods.
 */
export function calculateFactorImportance(
  data: GridData[], 
  config: SimulationConfig, 
  activityData: any[], 
  housePriceMetrics: any[], 
  streetViewMetrics: any[],
  targetAreaGeoJSON?: any
): number[] {
  const subMode = config.factorSubMode;
  void targetAreaGeoJSON;
  
  return data.map((d, i) => {
    const poiDensity = d3.sum(Object.values(d.pois));
    const housePrice = housePriceMetrics && housePriceMetrics[i]
      ? getNumeric(housePriceMetrics[i], ['小区均价', 'house_price', 'avg_price', 'price'], 0)
      : 0;
    const greenView = streetViewMetrics && streetViewMetrics[i] ? parseFloat(streetViewMetrics[i].green_view || 0) : 0;
    const activity = activityData && activityData[i]
      ? getNumeric(activityData[i], ['activity_count', 'activity_account', 'activity'], 0)
      : 0;
    
    // Normalize values for mock calculations
    const nPoi = Math.min(1, poiDensity / 50);
    const nPrice = Math.min(1, housePrice / 150000);
    const nGreen = Math.min(1, greenView);
    const nActivity = Math.min(1, activity / 1000);

    if (subMode === 'importance') {
      // SHAP / Feature Importance (Non-linear ensemble)
      return (nPoi * 0.45) + (nPrice * 0.25) + (nGreen * 0.2) + (nActivity * 0.1);
    } else if (subMode === 'linear') {
      // OLS Linear Regression (Simple additive)
      return (nPoi * 0.35) + (nPrice * 0.45) + (nActivity * 0.2);
    } else if (subMode === 'rf') {
      // Random Forest (Interaction effects)
      return (nPoi * nPrice * 0.6) + (nGreen * 0.4);
    } else if (subMode === 'gwr') {
      // Geographically Weighted Regression (Spatial variation)
      const spatialFactor = Math.sin(d.x * 50) * Math.cos(d.y * 50);
      return (nPoi * (0.4 + spatialFactor * 0.3)) + (nPrice * (0.6 - spatialFactor * 0.3));
    } else if (subMode === 'lasso') {
      // Lasso Regression (Feature selection/sparsity)
      // Lasso often zeros out less important features
      return (nPoi * 0.7) + (nPrice * 0.3); // Simplified: Green and Activity dropped
    }
    
    return 0;
  });
}

/**
 * Calculates location analysis (boundary visualization).
 */
export function calculateLocationAnalysis(data: GridData[]): number[] {
  return data.map(() => 1);
}

/**
 * Traffic analysis heat for grid cells.
 * Combines: grid-level交通设施强度(JTSS) + road network global flow/class signal.
 */
export function calculateTrafficHeat(
  data: GridData[],
  roadNetworkData: Array<{ flowScore?: number; osmTag?: string; functionalClass?: string }> = []
): number[] {
  if (!data || data.length === 0) return [];

  const jtssVals = data.map(d => d.pois.JTSS || 0);
  const jtssMax = d3.max(jtssVals) || 1;

  const roadAvgFlow = roadNetworkData.length > 0
    ? (d3.mean(roadNetworkData, d => Number(d.flowScore || 0)) || 1)
    : 1;

  const trunkRatio = roadNetworkData.length > 0
    ? roadNetworkData.filter(d => {
        const tag = `${d.osmTag || ''} ${d.functionalClass || ''}`.toLowerCase();
        return tag.includes('trunk') || tag.includes('primary') || tag.includes('secondary');
      }).length / roadNetworkData.length
    : 0.3;

  const networkFactor = 0.7 + roadAvgFlow * 0.2 + trunkRatio * 0.8;

  return data.map(d => {
    const base = (d.pois.JTSS || 0) / jtssMax;
    const mixedPoi = ((d.pois.CYMS || 0) + (d.pois.GWXF || 0)) * 0.05;
    return Math.max(0, base * networkFactor + mixedPoi);
  });
}

/**
 * Analyzes active regions and identifies ideal data ranges.
 */
export function calculateRegionSelection(
  data: GridData[], 
  activityData: any[],
  housePriceMetrics: any[],
  streetViewMetrics: any[],
  threshold: number = 0.67
): { values: number[], idealRanges: any } {
  const activeIndices = data
    .map((_, i) => i)
    .filter(i => {
      const activity = activityData && activityData[i]
        ? getNumeric(activityData[i], ['activity_count', 'activity_account', 'activity'], 0)
        : 0;
      return Number.isFinite(activity) && activity > 0;
    });

  if (activeIndices.length === 0) return { values: data.map(() => 0), idealRanges: {} };

  const getFeatureValue = (featureKey: string, i: number): number | null => {
    const grid = data[i];
    const house = housePriceMetrics && housePriceMetrics[i] ? housePriceMetrics[i] : null;
    const street = streetViewMetrics && streetViewMetrics[i] ? streetViewMetrics[i] : null;

    if (!grid) return null;

    if (featureKey === 'poi_density') return d3.sum(Object.values(grid.pois));
    if (featureKey === 'traffic_poi') return grid.pois.JTSS || 0;
    if (featureKey === 'house_price') {
      return house ? getNumeric(house, ['小区均价', 'house_price', 'avg_price', 'price'], 0) : null;
    }
    if (featureKey === 'green_view') return street ? parseFloat(street.green_view || 0) : null;
    if (featureKey === 'sky_view') return street ? parseFloat(street.sky_view || 0) : null;
    if (featureKey === 'continuity') return street ? parseFloat(street.interface_continuity || 0) : null;
    if (featureKey === 'walkability') return street ? parseFloat(street.walkability || 0) : null;
    if (featureKey === 'traffic_pressure') return street ? parseFloat(street.traffic_pressure || 0) : null;

    return null;
  };

  const featureKeys = [
    'poi_density',
    'traffic_poi',
    'traffic_pressure',
    'green_view',
    'sky_view',
    'continuity',
    'walkability',
    'house_price'
  ];

  const idealRanges: any = {};
  featureKeys.forEach(key => {
    const vals = activeIndices
      .map(i => getFeatureValue(key, i))
      .filter((v): v is number => v !== null && Number.isFinite(v));

    if (vals.length >= 5) {
      const sorted = [...vals].sort((a, b) => a - b);
      const q1 = Number(d3.quantileSorted(sorted, 0.25) ?? d3.min(sorted) ?? 0);
      const q3 = Number(d3.quantileSorted(sorted, 0.75) ?? d3.max(sorted) ?? 0);
      const iqr = Math.max(1e-6, q3 - q1);
      const relax = Math.max(0.15, (1 - threshold) * 0.9);
      const min = q1 - iqr * (0.6 + relax);
      const max = q3 + iqr * (0.6 + relax);

      idealRanges[key] = {
        min,
        max,
        mean: d3.mean(vals) || 0,
        q1,
        q3
      };
    }
  });

  const softScore = (value: number | null, min: number, max: number) => {
    if (value === null || !Number.isFinite(value)) return null;
    if (value >= min && value <= max) return 1;
    const span = Math.max(1e-6, max - min);
    const tolerance = span * 0.4;
    if (value < min) return Math.max(0, 1 - (min - value) / tolerance);
    return Math.max(0, 1 - (value - max) / tolerance);
  };

  const values = data.map((_, i) => {
    const criteria: number[] = [];
    Object.entries(idealRanges).forEach(([key, range]: [string, any]) => {
      const v = getFeatureValue(key, i);
      const s = softScore(v, range.min, range.max);
      if (s !== null) criteria.push(s);
    });

    if (criteria.length === 0) return 0;
    return d3.mean(criteria) || 0;
  });

  return { values, idealRanges };
}
