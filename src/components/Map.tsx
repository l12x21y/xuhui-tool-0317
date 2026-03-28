import { useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import {
  AttractionBaselineByCategory,
  GridData,
  GridMetricRow,
  ImportanceWeightsByCategory,
  MainMode,
  SimulationConfig,
  TemporalWeightsPayload,
} from '../types';
import {
  calculateClusterIdentification,
  calculateFlowPrediction,
  calculateGlobalMoran,
  calculateGridScore,
  calculateHeatValues,
  calculateHousePrice,
  calculateKdeCross,
  calculateMixDegree,
  calculateStreetView,
  emptyValues,
} from '../services/simulation';

interface MapProps {
  data: GridData[];
  scopeBoundary: any;
  config: SimulationConfig;
  viewMode: MainMode;
  selectedGridId?: string;
  onGridClick: (grid: GridData) => void;
  housePriceRows: GridMetricRow[];
  streetViewRows: GridMetricRow[];
  dxjhMetricRows: GridMetricRow[];
  importanceByCategory: ImportanceWeightsByCategory;
  attractionByCategory: AttractionBaselineByCategory;
  temporalWeights: TemporalWeightsPayload | null;
}

const normalizeId = (value: unknown) => {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const num = Number(raw);
  return Number.isFinite(num) ? String(Math.trunc(num)) : raw;
};

const getFeatureId = (feature: any) => normalizeId(feature?.properties?.cell_id ?? feature?.properties?.grid_id ?? feature?.id);

const FitBounds = ({ bounds }: { bounds: LatLngBoundsExpression }) => {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [20, 20] });
  }, [bounds, map]);
  return null;
};

const EnsurePanes = () => {
  const map = useMap();
  useEffect(() => {
    const gridPane = map.getPane('grid-pane') ?? map.createPane('grid-pane');
    gridPane.style.zIndex = '430';

    const boundaryPane = map.getPane('boundary-pane') ?? map.createPane('boundary-pane');
    boundaryPane.style.zIndex = '650';
    boundaryPane.style.pointerEvents = 'none';
  }, [map]);
  return null;
};

const quantileColor = (values: number[], value: number, palette = d3.interpolateYlOrRd) => {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return '#f1f5f9';
  const scale = d3.scaleQuantile().domain(valid).range(d3.range(6));
  const idx = Number(scale(value) ?? 0);
  return palette(Math.max(0, Math.min(1, idx / 5)));
};

export const Map = ({
  data,
  scopeBoundary,
  config,
  viewMode,
  selectedGridId,
  onGridClick,
  housePriceRows,
  streetViewRows,
  dxjhMetricRows,
  importanceByCategory,
  attractionByCategory,
  temporalWeights,
}: MapProps) => {
  const activeBoundary = useMemo(() => {
    if (!scopeBoundary) return null;
    if (scopeBoundary.type === 'FeatureCollection') return scopeBoundary;
    if (scopeBoundary.type === 'Feature') return { type: 'FeatureCollection', features: [scopeBoundary] };
    return null;
  }, [scopeBoundary]);

  const filteredData = useMemo(() => {
    if (!activeBoundary) return data;
    const subset = data.filter((grid) => {
      try {
        const centroid = d3.geoCentroid(grid.feature);
        return d3.geoContains(activeBoundary as any, centroid);
      } catch {
        return false;
      }
    });
    if (subset.length === 0) return data;
    if (subset.length / Math.max(1, data.length) < 0.05) return data;
    return subset;
  }, [activeBoundary, data]);

  const dataById = useMemo(() => {
    const map = new globalThis.Map<string, GridData>();
    for (const item of filteredData) {
      map.set(normalizeId(item.id), item);
      map.set(normalizeId(item.feature?.properties?.cell_id), item);
      map.set(normalizeId(item.feature?.properties?.grid_id), item);
    }
    return map;
  }, [filteredData]);

  const flowChangedGridSet = useMemo(() => {
    const set = new Set<string>();
    for (const id of config.flowSelectedGridIds) set.add(normalizeId(id));
    for (const change of config.flowChanges) {
      for (const id of change.gridIds) set.add(normalizeId(id));
    }
    return set;
  }, [config.flowSelectedGridIds, config.flowChanges]);

  const baseHeat = useMemo(() => calculateHeatValues(filteredData, config), [filteredData, config]);

  const renderValues = useMemo(() => {
    if (viewMode === 'location') return emptyValues(filteredData.length);
    if (viewMode === 'traffic' || viewMode === 'activity') return emptyValues(filteredData.length);
    if (viewMode === 'heat') return baseHeat;
    if (viewMode === 'kde') return calculateKdeCross(baseHeat, filteredData);
    if (viewMode === 'house_price') return calculateHousePrice(filteredData, housePriceRows);
    if (viewMode === 'street_view') return calculateStreetView(filteredData, streetViewRows);
    if (viewMode === 'spatial_autocorrelation') return baseHeat.map(() => calculateGlobalMoran(baseHeat, filteredData));
    if (viewMode === 'mix_degree') return calculateMixDegree(filteredData);
    if (viewMode === 'cluster_identification') return calculateClusterIdentification(baseHeat);
    if (viewMode === 'space_syntax') return emptyValues(filteredData.length);
    if (viewMode === 'grid_score') return calculateGridScore(filteredData, dxjhMetricRows, importanceByCategory[config.factorBusinessCategory] || {});
    if (viewMode === 'factor_correlation') return emptyValues(filteredData.length);
    if (viewMode === 'flow_prediction') {
      return calculateFlowPrediction(filteredData, dxjhMetricRows, importanceByCategory, attractionByCategory, temporalWeights, config);
    }
    return emptyValues(filteredData.length);
  }, [
    viewMode,
    filteredData,
    baseHeat,
    housePriceRows,
    streetViewRows,
    dxjhMetricRows,
    importanceByCategory,
    attractionByCategory,
    temporalWeights,
    config,
  ]);

  const valueById = useMemo(() => {
    const map = new globalThis.Map<string, number>();
    filteredData.forEach((grid, index) => {
      const value = renderValues[index] ?? 0;
      map.set(normalizeId(grid.id), value);
      map.set(normalizeId(grid.feature?.properties?.cell_id), value);
      map.set(normalizeId(grid.feature?.properties?.grid_id), value);
    });
    return map;
  }, [filteredData, renderValues]);

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const fitTarget = activeBoundary && activeBoundary.features?.length
      ? activeBoundary
      : { type: 'FeatureCollection', features: filteredData.map((item) => item.feature) };

    if (!fitTarget.features.length) return null;
    const [[minLng, minLat], [maxLng, maxLat]] = d3.geoBounds(fitTarget as any);
    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
    return [[minLat, minLng], [maxLat, maxLng]];
  }, [activeBoundary, filteredData]);

  const boundaryKey = useMemo(() => {
    if (!activeBoundary?.features?.length) return 'none';
    try {
      const [[minLng, minLat], [maxLng, maxLat]] = d3.geoBounds(activeBoundary as any);
      return `${activeBoundary.features.length}-${minLng.toFixed(6)}-${minLat.toFixed(6)}-${maxLng.toFixed(6)}-${maxLat.toFixed(6)}`;
    } catch {
      return String(activeBoundary.features.length);
    }
  }, [activeBoundary]);

  const placeholderText =
    viewMode === 'traffic'
      ? '交通分析暂时保持空白'
      : viewMode === 'activity'
      ? '活动分析暂时保持空白'
      : viewMode === 'space_syntax'
      ? '空间句法暂时保持空白'
      : viewMode === 'factor_correlation'
      ? '因子关联分析暂时保持空白'
      : null;

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-slate-200 shadow-inner bg-white">
      <MapContainer center={[31.18, 121.43]} zoom={12} className="w-full h-full" zoomControl attributionControl preferCanvas>
        <EnsurePanes />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution="(C) OpenStreetMap contributors (C) CARTO"
        />

        {bounds && <FitBounds bounds={bounds} />}

        {filteredData.length > 0 && (
          <GeoJSON
            key={`grid-${viewMode}-${filteredData.length}-${config.heatMode}`}
            pane="grid-pane"
            data={{ type: 'FeatureCollection', features: filteredData.map((item) => item.feature) } as any}
            style={(feature: any) => {
              const id = getFeatureId(feature);
              const value = valueById.get(id) ?? 0;
              const isSelected = id === normalizeId(selectedGridId);
              const isFlowChanged = flowChangedGridSet.has(id);

              if (viewMode === 'location') {
                return {
                  color: isSelected ? '#dc2626' : '#94a3b8',
                  weight: isSelected ? 1.6 : 0.6,
                  fillColor: isSelected ? '#fecaca' : '#e2e8f0',
                  fillOpacity: isSelected ? 0.35 : 0.1,
                };
              }

              if (viewMode === 'cluster_identification') {
                const colors = ['#e2e8f0', '#bae6fd', '#93c5fd', '#60a5fa'];
                return {
                  color: isSelected ? '#dc2626' : '#ffffff',
                  weight: isSelected ? 2 : 0.4,
                  fillColor: colors[Math.max(0, Math.min(3, Math.round(value)))],
                  fillOpacity: 0.9,
                };
              }

              if (placeholderText) {
                return {
                  color: isSelected ? '#dc2626' : '#cbd5e1',
                  weight: isSelected ? 2 : 0.5,
                  fillColor: '#f8fafc',
                  fillOpacity: 0.7,
                };
              }

              if (viewMode === 'flow_prediction' && isFlowChanged) {
                return {
                  color: '#7c3aed',
                  weight: 1.8,
                  fillColor: quantileColor(renderValues, value),
                  fillOpacity: 0.92,
                };
              }

              return {
                color: isSelected ? '#dc2626' : '#ffffff',
                weight: isSelected ? 2 : 0.4,
                fillColor: quantileColor(renderValues, value),
                fillOpacity: 0.9,
              };
            }}
            onEachFeature={(feature: any, layer: any) => {
              const id = getFeatureId(feature);
              const grid = dataById.get(id);
              layer.on('click', () => {
                if (grid) onGridClick(grid);
              });
            }}
          />
        )}

        {activeBoundary && (
          <GeoJSON
            key={`boundary-${viewMode}-${boundaryKey}`}
            pane="boundary-pane"
            data={activeBoundary as any}
            style={{
              color: '#334155',
              weight: 2,
              fillOpacity: 0,
            }}
          />
        )}
      </MapContainer>

      {placeholderText && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-md bg-white/95 px-3 py-2 text-xs text-slate-600 border border-slate-200 shadow-sm">
          {placeholderText}
        </div>
      )}

      {viewMode === 'spatial_autocorrelation' && renderValues.length > 0 && (
        <div className="absolute bottom-4 left-4 rounded-md bg-white/95 px-3 py-2 text-xs text-slate-700 border border-slate-200 shadow-sm">
          Moran's I: {renderValues[0].toFixed(4)}
        </div>
      )}
    </div>
  );
};
