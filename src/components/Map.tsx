import React, { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import { GridData, SimulationConfig, ViewMode, POICategories, MainMode, HeatSubMode, POI_LABELS, RoadNetworkRecord, LocationAreaMode, RoadFeatureCollection } from '../types';
import { calculateHeat, calculatePOIAverages, calculateKDE, calculateFlow, calculateAggregation, calculateEntropy, calculateLISA, calculateDBSCAN, calculateSpaceSyntax, calculateHousePriceAnalysis, calculateStreetViewAnalysis, calculateActivityAnalysis, calculateFactorImportance, calculateLocationAnalysis, calculateRegionSelection, calculateTrafficHeat } from '../services/simulation';
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';

interface MapProps {
  data: GridData[];
  config: SimulationConfig;
  boundary?: any;
  mergedArea?: any;
  roadNetworkData?: RoadNetworkRecord[];
  roadGeoData?: RoadFeatureCollection;
  housePriceGridMetrics?: any[];
  streetViewGridMetrics?: any[];
  activityGridData?: any[];
  onGridClick: (grid: GridData) => void;
  viewMode: MainMode;
  locationAreaMode?: LocationAreaMode;
  selectedGridId?: string;
  restrictToBoundary?: boolean;
}

const CATEGORY_COLORS: Record<string, (t: number) => string> = {
  heat: d3.interpolateViridis,
  kde: d3.interpolateReds,
  entropy: d3.interpolateYlGn,
  moran: d3.interpolateMagma,
  space_syntax: d3.interpolateRdPu,
  house_price: d3.interpolateYlOrRd,
  street_view: d3.interpolateCool,
  activity_analysis: d3.interpolateYlOrBr,
  CYMS: d3.interpolateOranges,
  GSQY: d3.interpolateBlues,
  GWXF: d3.interpolatePurples,
  JTSS: d3.interpolateGreys,
  JRJG: d3.interpolateGnBu,
  JDZS: d3.interpolateYlOrBr,
  KJWH: d3.interpolatePuBuGn,
  LYJD: d3.interpolateGreens,
  QCXG: d3.interpolateRdGy,
  SWZZ: d3.interpolateYlGnBu,
  SHFW: d3.interpolateRdPu,
  XXYL: d3.interpolatePuRd,
  YLBJ: d3.interpolateBuGn,
  YDJS: d3.interpolateSpectral
};

// LISA Colors
const LISA_COLORS: Record<string, string> = {
  'HH': '#ef4444', // High-High (Red)
  'LL': '#3b82f6', // Low-Low (Blue)
  'HL': '#fca5a5', // High-Low (Light Red)
  'LH': '#93c5fd', // Low-High (Light Blue)
  'NS': '#f1f5f9'  // Not Significant (Gray)
};

const FitLocationBounds: React.FC<{ bounds: LatLngBoundsExpression }> = ({ bounds }) => {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);

  return null;
};

export const Map: React.FC<MapProps> = ({ 
  data, 
  config, 
  boundary, 
  mergedArea,
  roadNetworkData,
  roadGeoData,
  housePriceGridMetrics,
  streetViewGridMetrics,
  activityGridData,
  onGridClick, 
  viewMode, 
  locationAreaMode = 'xuhui',
  selectedGridId,
  restrictToBoundary = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  const locationBoundaryGeo = useMemo(() => {
    if (!boundary) return null;
    if (boundary.type === 'FeatureCollection') return boundary;
    if (boundary.type === 'Feature') return { type: 'FeatureCollection', features: [boundary] };
    return null;
  }, [boundary]);

  const mergedAreaGeo = useMemo(() => {
    if (!mergedArea) return null;
    if (mergedArea.type === 'FeatureCollection') return mergedArea;
    if (mergedArea.type === 'Feature') return { type: 'FeatureCollection', features: [mergedArea] };
    return null;
  }, [mergedArea]);

  const activeLocationGeo = useMemo(() => {
    if (locationAreaMode === 'greater_xujiahui' && mergedAreaGeo) return mergedAreaGeo;
    return locationBoundaryGeo || mergedAreaGeo;
  }, [locationAreaMode, locationBoundaryGeo, mergedAreaGeo]);

  const displayData = useMemo(() => {
    if (restrictToBoundary && locationBoundaryGeo) {
      return data.filter(d => {
        try {
          const centroid = d3.geoCentroid(d.feature);
          return d3.geoContains(locationBoundaryGeo as any, centroid);
        } catch (e) {
          return false;
        }
      });
    }
    return data;
  }, [data, restrictToBoundary, locationBoundaryGeo]);

  const locationGridGeo = useMemo(() => {
    const features = displayData.map(d => d.feature).filter(Boolean);
    return { type: 'FeatureCollection', features };
  }, [displayData]);

  const locationGridGeoWithId = useMemo(() => {
    const features = displayData
      .filter(d => d.feature)
      .map(d => ({
        ...d.feature,
        properties: {
          ...(d.feature?.properties || {}),
          __gridId: d.id
        }
      }));
    return { type: 'FeatureCollection', features };
  }, [displayData]);

  const locationBounds = useMemo<LatLngBoundsExpression | null>(() => {
    const fitTarget = (activeLocationGeo && activeLocationGeo.features?.length > 0)
      ? activeLocationGeo
      : locationGridGeo;

    if (!fitTarget?.features?.length) return null;
    const [[minLng, minLat], [maxLng, maxLat]] = d3.geoBounds(fitTarget as any);
    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;

    return [[minLat, minLng], [maxLat, maxLng]];
  }, [activeLocationGeo, locationGridGeo]);

  const visibleRoadFeatures = useMemo(() => {
    const allFeatures = roadGeoData?.features || [];
    if (allFeatures.length === 0) return [] as any[];

    const lineFeatures = allFeatures.filter((f: any) =>
      f?.geometry?.type === 'LineString' || f?.geometry?.type === 'MultiLineString'
    );

    if (!locationBoundaryGeo) return lineFeatures.slice(0, 12000);

    const inBoundary = lineFeatures.filter((feature: any) => {
      try {
        const type = feature?.geometry?.type;
        const coords = feature?.geometry?.coordinates;
        if (!coords) return false;

        let samplePoint: [number, number] | null = null;
        if (type === 'LineString' && Array.isArray(coords) && coords.length > 0) {
          samplePoint = coords[Math.floor(coords.length / 2)] as [number, number];
        } else if (type === 'MultiLineString' && Array.isArray(coords) && coords.length > 0) {
          const line = coords.find((item: any) => Array.isArray(item) && item.length > 0);
          if (line) {
            samplePoint = line[Math.floor(line.length / 2)] as [number, number];
          }
        }

        if (!samplePoint || samplePoint.length < 2) return false;
        return d3.geoContains(locationBoundaryGeo as any, samplePoint as [number, number]);
      } catch {
        return false;
      }
    });

    return inBoundary.slice(0, 12000);
  }, [roadGeoData, locationBoundaryGeo]);

  const locationGeoKey = useMemo(() => {
    const modeTag = locationAreaMode === 'greater_xujiahui' ? 'greater' : 'xuhui';
    const featureCount = activeLocationGeo?.features?.length || 0;
    return `${modeTag}-${featureCount}`;
  }, [locationAreaMode, activeLocationGeo]);

  const trafficRoadGeo = useMemo(() => {
    if (visibleRoadFeatures.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features: visibleRoadFeatures,
    } as RoadFeatureCollection;
  }, [visibleRoadFeatures]);

  const trafficNetworkBounds = useMemo<LatLngBoundsExpression | null>(() => {
    const fitTarget = locationBoundaryGeo || trafficRoadGeo;
    if (!fitTarget?.features?.length) return null;
    const [[minLng, minLat], [maxLng, maxLat]] = d3.geoBounds(fitTarget as any);
    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
    return [[minLat, minLng], [maxLat, maxLng]];
  }, [locationBoundaryGeo, trafficRoadGeo]);

  useEffect(() => {
    if (!svgRef.current || !displayData.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    const selectedGlow = defs.append('filter')
      .attr('id', 'selected-grid-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    selectedGlow.append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 0)
      .attr('stdDeviation', 4)
      .attr('flood-color', '#ef4444')
      .attr('flood-opacity', 0.95);

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Set viewBox for proper scaling
    svg.attr('viewBox', `0 0 ${width} ${height}`)
       .attr('width', width)
       .attr('height', height);

    const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Use geoIdentity for scaling. This handles both degrees and meters 
    // by fitting the bounding box to the screen.
    const projection = d3.geoIdentity()
      .reflectY(true); // Geographic coordinates have Y increasing upwards, SVG downwards
    
    // Collect all features to fit the view
    const allFeatures: any[] = [];
    if (displayData.length > 0) {
      allFeatures.push(...displayData.map(d => d.feature).filter(Boolean));
    }
    
    // If no grid data or specifically in location analysis, use boundary to ensure it fits
    if (boundary && (allFeatures.length === 0 || viewMode === 'location_analysis')) {
      if (boundary.type === 'FeatureCollection') {
        allFeatures.push(...boundary.features);
      } else {
        allFeatures.push(boundary);
      }
    }

    if (allFeatures.length > 0) {
      const fitObject = { type: 'FeatureCollection', features: allFeatures };
      projection.fitSize([innerWidth, innerHeight], fitObject as any);
    }

    const path = d3.geoPath().projection(projection);
    const isTrafficNetworkMode = viewMode === 'traffic_analysis' && config.trafficSubMode === 'network';

    // 1. Calculate values based on viewMode
    let values: number[] = [];
    let flowVectors: [number, number][] = [];
    let lisaCategories: string[] = [];
    let dbscanClusters: number[] = [];
    let regionEffectiveThreshold = (config.regionSelectionThreshold ?? 52) / 100;
    
    // Pre-calculate averages for simulation
    const averages = (viewMode === 'heat' || viewMode === 'flow_analysis' || viewMode === 'spatial_autocorrelation') 
      ? calculatePOIAverages(displayData) 
      : {};

    if (viewMode === 'heat') {
      if (config.heatSubMode === 'simulation') {
        values = displayData.map(d => calculateHeat(d, config, undefined, averages));
      } else if (config.heatSubMode === 'multi') {
        values = displayData.map(d => calculateHeat(d, config, config.multiFactorCategories, averages));
      } else {
        values = displayData.map(d => d.pois[config.singleFactorCategory || 'CYMS'] || 0);
      }
    } else if (viewMode === 'kde') {
      values = calculateKDE(displayData, config);
    } else if (viewMode === 'flow_analysis') {
      if (config.flowSubMode === 'custom_formula') {
        // 人流预测模拟中保留全类别基线，仅通过权重体现重点因子
        values = displayData.map(d => calculateHeat(d, config, undefined, averages));
        flowVectors = calculateFlow(displayData, config);
      } else {
        values = calculateAggregation(displayData, config);
      }
    } else if (viewMode === 'entropy') {
      values = calculateEntropy(displayData, config);
    } else if (viewMode === 'spatial_autocorrelation') {
      if (config.spatialSubMode === 'moran') {
        values = data.map(d => calculateHeat(d, config, config.moranCategories, averages));
      } else {
        const lisaValues = calculateLISA(data, config);
        const heatValues = data.map(d => calculateHeat(d, config, config.lisaCategories, averages));
        const meanHeat = d3.mean(heatValues) || 0;
        
        lisaCategories = lisaValues.map((v, i) => {
          if (Math.abs(v) < 0.05) return 'NS'; 
          const isHigh = heatValues[i] > meanHeat;
          const isNeighborHigh = v > 0 ? isHigh : !isHigh;
          
          if (isHigh && isNeighborHigh) return 'HH';
          if (!isHigh && !isNeighborHigh) return 'LL';
          if (isHigh && !isNeighborHigh) return 'HL';
          return 'LH';
        });
      }
    } else if (viewMode === 'dbscan') {
      dbscanClusters = calculateDBSCAN(displayData, config);
    } else if (viewMode === 'space_syntax') {
      values = calculateSpaceSyntax(displayData, config);
    } else if (viewMode === 'house_price') {
      values = calculateHousePriceAnalysis(displayData, config, housePriceGridMetrics || []);
    } else if (viewMode === 'street_view') {
      values = calculateStreetViewAnalysis(displayData, config, streetViewGridMetrics || []);
    } else if (viewMode === 'activity_analysis') {
      values = calculateActivityAnalysis(displayData, config, activityGridData || []);
    } else if (viewMode === 'factor_importance') {
      values = calculateFactorImportance(
        displayData,
        config,
        activityGridData || [],
        housePriceGridMetrics || [],
        streetViewGridMetrics || [],
        mergedArea || null
      );
    } else if (viewMode === 'traffic_analysis') {
      values = calculateTrafficHeat(displayData, roadNetworkData || []);
    } else if (viewMode === 'location_analysis') {
      values = calculateLocationAnalysis(displayData);
    }

    const nonZeroValues = values.filter(v => v > 0);
    const finiteValues = values.filter(v => Number.isFinite(v));
    const factorDomainValues = finiteValues.filter(v => v !== 0);
    
    // Choose color interpolator based on mode
    let colorInterpolator = CATEGORY_COLORS.heat;
    if (viewMode === 'kde') {
      colorInterpolator = CATEGORY_COLORS.kde;
    } else if (viewMode === 'flow_analysis') {
      colorInterpolator = config.flowSubMode === 'custom_formula' ? d3.interpolateGnBu : d3.interpolateYlGnBu;
    } else if (viewMode === 'entropy') {
      colorInterpolator = CATEGORY_COLORS.entropy;
    } else if (viewMode === 'spatial_autocorrelation') {
      colorInterpolator = CATEGORY_COLORS.moran;
    } else if (viewMode === 'space_syntax') {
      colorInterpolator = CATEGORY_COLORS.space_syntax;
    } else if (viewMode === 'house_price') {
      if (config.housePriceSubMode === 'hotspot') {
        colorInterpolator = (t: number) => d3.interpolateRdBu(1 - t); // Reverse so red is high
      } else if (['price', 'area', 'plot_ratio', 'green_ratio'].includes(config.housePriceSubMode)) {
        colorInterpolator = d3.interpolateYlOrRd;
      } else {
        colorInterpolator = CATEGORY_COLORS.house_price;
      }
    } else if (viewMode === 'street_view') {
      if (['green_view', 'sky_view', 'continuity', 'traffic', 'activity'].includes(config.streetViewSubMode)) {
        colorInterpolator = d3.interpolateCool;
      } else {
        colorInterpolator = CATEGORY_COLORS.street_view;
      }
    } else if (viewMode === 'heat') {
      if (config.heatSubMode === 'single' && config.singleFactorCategory) {
        colorInterpolator = CATEGORY_COLORS[config.singleFactorCategory] || CATEGORY_COLORS.heat;
      } else if (config.heatSubMode === 'simulation') {
        // 改为科研常用的浅到深顺序色带，视觉更沉稳
        colorInterpolator = d3.interpolateBlues;
      } else {
        // 多因子采用浅到深顺序色带，便于学术展示
        colorInterpolator = d3.interpolateBlues;
      }
    } else if (viewMode === 'activity_analysis') {
      colorInterpolator = d3.interpolateRdPu;
    } else if (viewMode === 'traffic_analysis') {
      colorInterpolator = d3.interpolateYlOrRd;
    } else if (viewMode === 'factor_importance') {
      colorInterpolator = d3.interpolateGreens;
    } else if (viewMode === 'region_selection') {
      const threshold = (config.regionSelectionThreshold ?? 52) / 100;
      const minRatio = config.regionSelectionMinRatio ?? 0.01;
      const { values: regionValues } = calculateRegionSelection(data, activityGridData, housePriceGridMetrics, streetViewGridMetrics, threshold);
      const sorted = [...regionValues].sort((a, b) => a - b);
      const selectedCount = regionValues.filter(v => v >= threshold).length;
      const minCount = Math.max(1, Math.ceil(regionValues.length * Math.max(0.01, Math.min(0.95, minRatio))));
      const rankIdx = Math.max(0, sorted.length - minCount);
      const ratioThreshold = Number(sorted[rankIdx] ?? threshold);
      const effectiveThreshold = selectedCount >= minCount ? threshold : Math.min(threshold, ratioThreshold);
      regionEffectiveThreshold = effectiveThreshold;
      values = regionValues;
      colorInterpolator = (t) => t >= effectiveThreshold ? '#ef4444' : 'rgba(241, 245, 249, 0.18)';
    } else if (viewMode === 'location_analysis') {
      colorInterpolator = () => 'rgba(99, 102, 241, 0.05)';
    }
    
    const maxValue = d3.max(values) || 1;

    // Use Linear scale for simulation to show growth, Quantile for others for better distribution
    const isSimulation = config.isSimulationActive && (viewMode === 'heat' || viewMode === 'flow_analysis');
    
    const quantileDomain = viewMode === 'factor_importance'
      ? (factorDomainValues.length > 0 ? factorDomainValues : finiteValues)
      : nonZeroValues;

    let colorScale: any;
    if (quantileDomain.length > 0) {
      if (isSimulation) {
        // For simulation, map from a small positive min to max to avoid very pale low-end
        const minNonZero = d3.min(nonZeroValues) || 0;
        const simMin = minNonZero > 0 ? minNonZero : Math.max(maxValue * 0.02, 1e-6);
        colorScale = d3.scaleLinear<string>()
          .domain([simMin, maxValue])
          .range([colorInterpolator(0.18), colorInterpolator(1)])
          .clamp(true);
      } else {
        colorScale = d3.scaleQuantile<string>()
          .domain(quantileDomain)
          .range(d3.range(7).map(i => colorInterpolator(i / 6)));
      }
    } else {
      colorScale = d3.scaleOrdinal<number, string>().domain([0]).range([colorInterpolator(0)]);
    }

    // DBSCAN color scale
    const clusterColorScale = d3.scaleOrdinal(d3.schemeTableau10);

    // 1. Draw Grid Cells (Bottom Layer)
    const gridCells = g.selectAll('path.grid-cell')
      .data(displayData, (d: any) => d.id);

    gridCells.enter()
      .append('path')
      .attr('class', 'grid-cell')
      .merge(gridCells as any)
      .attr('d', d => {
        const pathStr = path((d as GridData).feature);
        return pathStr || '';
      })
      .attr('fill', (d, i) => {
        if (isTrafficNetworkMode) {
          if (selectedGridId === (d as GridData).id) return 'rgba(239,68,68,0.22)';
          return 'rgba(148,163,184,0.06)';
        }
        if (viewMode === 'region_selection') {
          const val = values[i] || 0;
          return val >= regionEffectiveThreshold ? '#ef4444' : 'rgba(241, 245, 249, 0.18)';
        }
        if (viewMode === 'factor_importance') {
          const val = values[i] ?? 0;
          return colorScale(val);
        }
        if (viewMode === 'spatial_autocorrelation' && config.spatialSubMode === 'lisa') {
          return LISA_COLORS[lisaCategories[i]];
        }
        if (viewMode === 'dbscan' || (viewMode === 'house_price' && config.housePriceSubMode === 'dbscan')) {
          const clusterId = viewMode === 'dbscan' ? dbscanClusters[i] : values[i];
          if (clusterId === -1) return '#f8fafc';
          if (clusterId === 0) return '#e2e8f0';
          return clusterColorScale(clusterId.toString());
        }
        
        const val = values[i];

        if (isSimulation) {
          // Make zero / empty cells background-like to avoid the map turning gray
          if (!val || val <= 0) return '#f8fafc';
          const simColor = colorScale(val);
          // Keep selected grid color stable
          if (selectedGridId === (d as GridData).id) return simColor;
          return simColor;
        }

        const baseColor = val === 0 ? (viewMode === 'kde' ? '#fff' : colorInterpolator(0)) : colorScale(val);

        // Keep selected grid color stable (no whitening), emphasis is via stroke+glow+scale
        if (selectedGridId === (d as GridData).id) return baseColor;

        return baseColor;
      })
      .attr('fill-opacity', viewMode === 'factor_importance' ? 0.96 : (isSimulation ? 1 : 0.9))
      .attr('stroke', (d) => {
        if (selectedGridId === (d as GridData).id) return '#ef4444';
        if (isTrafficNetworkMode) return 'rgba(148,163,184,0.28)';
        if (viewMode === 'region_selection') {
          const idx = data.findIndex(item => item.id === (d as GridData).id);
          const val = idx >= 0 ? (values[idx] || 0) : 0;
          return val >= regionEffectiveThreshold ? '#991b1b' : 'rgba(148,163,184,0.25)';
        }
        if (viewMode === 'kde' || (viewMode === 'flow_analysis' && config.flowSubMode === 'custom_formula') || (viewMode === 'spatial_autocorrelation' && config.spatialSubMode === 'lisa')) return 'none'; // Hide grid lines for smooth look
        return 'rgba(255,255,255,0.1)';
      })
      .attr('stroke-width', (d) => {
        if (selectedGridId === (d as GridData).id) return 4.2;
        if (isTrafficNetworkMode) return 0.45;
        if (viewMode === 'region_selection') {
          const idx = data.findIndex(item => item.id === (d as GridData).id);
          const val = idx >= 0 ? (values[idx] || 0) : 0;
          return val >= regionEffectiveThreshold ? 1.2 : 0.4;
        }
        return 0.3;
      })
      .attr('transform', (d) => {
        if (selectedGridId === (d as GridData).id) {
          // Get the centroid of the grid cell for scaling
          const centroid = d3.geoCentroid((d as GridData).feature);
          const [x, y] = projection(centroid);
          return `translate(${x}, ${y}) scale(1.45) translate(${-x}, ${-y})`;
        }
        return 'scale(1)';
      })
      .attr('filter', (d) => selectedGridId === (d as GridData).id ? 'url(#selected-grid-glow)' : null)
      .each(function(d) {
        // Bring selected grid to front
        if (selectedGridId === (d as GridData).id) {
          d3.select(this).raise();
        }
      })
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        if (selectedGridId === (d as GridData).id) return;
        if (viewMode === 'heat' && config.heatSubMode !== 'multi') {
          d3.select(this)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .attr('fill-opacity', 1)
            .raise();
        }
      })
      .on('mouseout', function(event, d) {
        if (selectedGridId === (d as GridData).id) return;
        if (viewMode === 'heat' && config.heatSubMode !== 'multi') {
          d3.select(this)
            .attr('stroke', 'rgba(255,255,255,0.1)')
            .attr('stroke-width', 0.3)
            .attr('fill-opacity', 0.9);
        }
      })
      .on('click', (event, d) => onGridClick(d as GridData));

    if (isTrafficNetworkMode && visibleRoadFeatures.length > 0) {
      const roadLayer = g.append('g').attr('class', 'traffic-network-lines');

      roadLayer.selectAll('path.road-link')
        .data(visibleRoadFeatures)
        .enter()
        .append('path')
        .attr('class', 'road-link')
        .attr('d', d => path(d as any) || '')
        .attr('stroke', '#334155')
        .attr('stroke-opacity', 0.68)
        .attr('fill', 'none')
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round')
        .attr('stroke-width', (d: any) => {
          const roadType = `${d?.properties?.type || d?.properties?.highway || ''}`;
          if (roadType.includes('高速') || roadType.includes('楂橀€熷叕璺') || roadType.toLowerCase().includes('motorway')) return 2.2;
          if (roadType.includes('主干') || roadType.includes('涓诲共') || roadType.toLowerCase().includes('trunk') || roadType.toLowerCase().includes('primary')) return 1.8;
          if (roadType.includes('次干') || roadType.includes('娆″共') || roadType.toLowerCase().includes('secondary')) return 1.35;
          return 0.95;
        });
    } else if (isTrafficNetworkMode && displayData.length > 1) {
      const roadLayer = g.append('g').attr('class', 'traffic-network-lines-fallback');
      const points = displayData.map((d, i) => {
        const centroid = d3.geoCentroid(d.feature);
        const projected = projection(centroid);
        return {
          id: d.id,
          x: projected?.[0] ?? 0,
          y: projected?.[1] ?? 0,
          weight: Number.isFinite(values[i]) ? values[i] : 0
        };
      });
      const segMap = new Map<string, { x1: number; y1: number; x2: number; y2: number; weight: number }>();
      const neighborCount = 2;

      points.forEach((p, idx) => {
        const neighbors = points
          .map((q, j) => ({
            j,
            dist: j === idx ? Infinity : (p.x - q.x) ** 2 + (p.y - q.y) ** 2
          }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, neighborCount);

        neighbors.forEach(n => {
          const q = points[n.j];
          const key = p.id < q.id ? `${p.id}|${q.id}` : `${q.id}|${p.id}`;
          if (!segMap.has(key)) {
            segMap.set(key, {
              x1: p.x,
              y1: p.y,
              x2: q.x,
              y2: q.y,
              weight: (p.weight + q.weight) / 2
            });
          }
        });
      });

      const segments = Array.from(segMap.values());
      roadLayer.selectAll('line.road-link-fallback')
        .data(segments)
        .enter()
        .append('line')
        .attr('class', 'road-link-fallback')
        .attr('x1', (d: any) => d.x1)
        .attr('y1', (d: any) => d.y1)
        .attr('x2', (d: any) => d.x2)
        .attr('y2', (d: any) => d.y2)
        .attr('stroke', '#334155')
        .attr('stroke-opacity', 0.35)
        .attr('stroke-linecap', 'round')
        .attr('stroke-width', 1.1);
    }

    // 1.5 Draw Flow Vectors
    if (viewMode === 'flow_analysis' && config.flowSubMode === 'custom_formula' && flowVectors.length > 0) {
      const flowG = g.append('g').attr('class', 'flow-vectors');
      displayData.forEach((d, i) => {
        const [vx, vy] = flowVectors[i];
        const mag = Math.sqrt(vx * vx + vy * vy);
        if (mag > 0.0001) {
          const centroid = d3.geoCentroid(d.feature);
          const [x, y] = projection(centroid);
          const angle = Math.atan2(vy, vx) * 180 / Math.PI;
          
          flowG.append('path')
            .attr('d', 'M-4,0 L4,0 M2,-2 L4,0 L2,2')
            .attr('stroke', '#059669')
            .attr('stroke-width', 2)
            .attr('fill', 'none')
            .attr('transform', `translate(${x},${y}) rotate(${angle}) scale(${Math.min(3, mag * 100)})`);
        }
      });
    }

    // 2. Draw Boundary (Top Layer - subtle overlay)
    if (boundary) {
      g.append('path')
        .datum(boundary)
        .attr('d', path as any)
        .attr('fill', viewMode === 'location_analysis' ? 'rgba(99, 102, 241, 0.05)' : 'none')
        .attr('stroke', viewMode === 'location_analysis' ? '#4f46e5' : '#1e293b') // Stronger indigo for location analysis
        .attr('stroke-width', viewMode === 'location_analysis' ? 3 : 1.5)
        .attr('stroke-opacity', viewMode === 'location_analysis' ? 0.8 : 0.4)
        .attr('stroke-linejoin', 'round')
        .attr('pointer-events', 'none');

      if (viewMode === 'location_analysis') {
        // Add a "glow" to the boundary
        g.append('path')
          .datum(boundary)
          .attr('d', path as any)
          .attr('fill', 'none')
          .attr('stroke', '#4f46e5')
          .attr('stroke-width', 6)
          .attr('stroke-opacity', 0.2)
          .attr('stroke-linejoin', 'round')
          .attr('pointer-events', 'none');
      }
    }

    // 不在非区位分析模式下绘制 mergedArea 的 SVG 覆盖，
    // 区位分析的边界渲染通过地图专用分支（Leaflet 或 activeLocationGeo）处理，
    // 以避免重复绘制导致的错位或视觉混淆。

    // 3. Draw events (Top Layer)
    // Always draw events if they exist, but especially in simulation
    const lat = boundary ? d3.geoCentroid(boundary)[1] : 31.2;
    const metersPerDegree = 111320 * Math.cos(lat * Math.PI / 180);
    
    // Get two points 0.01 degrees apart to find pixel scale
    const p1 = projection([121.4, 31.2])!;
    const p2 = projection([121.41, 31.2])!;
    const pixelsPerDegree = Math.abs(p2[0] - p1[0]) / 0.01;
    const pixelsPerMeter = pixelsPerDegree / metersPerDegree;

    config.events.forEach(event => {
      const [ex, ey] = projection([event.x, event.y])!;
      const pRadius = event.radius * pixelsPerMeter;

      // Draw heat center halo
      g.append('circle')
        .attr('cx', ex)
        .attr('cy', ey)
        .attr('r', pRadius)
        .attr('fill', 'rgba(245, 158, 11, 0.2)')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,2')
        .attr('pointer-events', 'none');

      // Draw event core
      g.append('circle')
        .attr('cx', ex)
        .attr('cy', ey)
        .attr('r', 8)
        .attr('fill', '#f59e0b')
        .attr('stroke', '#fff')
        .attr('stroke-width', 3)
        .attr('pointer-events', 'none')
        .attr('class', 'event-marker');
        
      g.append('text')
        .attr('x', ex)
        .attr('y', ey - 15)
        .attr('text-anchor', 'middle')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', '#b45309')
        .attr('stroke', '#fff')
        .attr('stroke-width', 3)
        .attr('paint-order', 'stroke')
        .text(event.name);
    });

    // 4. Legend
    if (viewMode === 'factor_importance') {
      const legendWidth = 14;
      const legendHeight = Math.max(180, Math.min(280, height * 0.45));
      const legendX = width - 56;
      const legendY = 42;
      const legendId = 'factor-vertical-gradient';

      const factorVals = values.filter(v => Number.isFinite(v));
      const factorMin = factorVals.length > 0 ? (d3.min(factorVals) ?? 0) : 0;
      const factorMax = factorVals.length > 0 ? (d3.max(factorVals) ?? 1) : 1;
      const minVal = factorMin === factorMax ? factorMin - 1 : factorMin;
      const maxVal = factorMin === factorMax ? factorMax + 1 : factorMax;

      const legend = svg.append('g')
        .attr('transform', `translate(${legendX}, ${legendY})`);

      const linearGradient = svg.append('defs')
        .append('linearGradient')
        .attr('id', legendId)
        .attr('x1', '0%')
        .attr('y1', '100%')
        .attr('x2', '0%')
        .attr('y2', '0%');

      linearGradient.selectAll('stop')
        .data(d3.range(0, 1.01, 0.1))
        .enter().append('stop')
        .attr('offset', d => `${d * 100}%`)
        .attr('stop-color', d => colorInterpolator(d));

      legend.append('rect')
        .attr('width', legendWidth)
        .attr('height', legendHeight)
        .attr('rx', 2)
        .style('fill', `url(#${legendId})`)
        .style('stroke', '#cbd5e1')
        .style('stroke-width', 0.6);

      const legendScale = d3.scaleLinear()
        .domain([minVal, maxVal])
        .range([legendHeight, 0]);

      const legendAxis = d3.axisRight(legendScale)
        .ticks(4)
        .tickSize(4);

      legend.append('g')
        .attr('transform', `translate(${legendWidth}, 0)`)
        .call(legendAxis as any)
        .select('.domain').remove();

      legend.append('text')
        .attr('x', -2)
        .attr('y', -10)
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .attr('fill', '#64748b')
        .text('因子测度热力');
    } else if (viewMode !== 'dbscan' && !(viewMode === 'flow_analysis' && config.flowSubMode === 'custom_formula') && !(viewMode === 'spatial_autocorrelation' && config.spatialSubMode === 'lisa')) {
      const legendWidth = 120;
      const legendHeight = 10;
      const legend = svg.append('g')
        .attr('transform', `translate(${width - legendWidth - 40}, ${height - 60})`);

      const legendScale = d3.scaleLinear()
        .domain([0, maxValue])
        .range([0, legendWidth]);

      const legendAxis = d3.axisBottom(legendScale)
        .ticks(3)
        .tickSize(13);

      const linearGradient = svg.append('defs')
        .append('linearGradient')
        .attr('id', 'linear-gradient');

      linearGradient.selectAll('stop')
        .data(d3.range(0, 1.1, 0.1))
        .enter().append('stop')
        .attr('offset', d => `${d * 100}%`)
        .attr('stop-color', d => colorInterpolator(d));

      legend.append('rect')
        .attr('width', legendWidth)
        .attr('height', legendHeight)
        .style('fill', 'url(#linear-gradient)');

      legend.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0, 0)`)
        .call(legendAxis as any)
        .select('.domain').remove();

      legend.append('text')
        .attr('x', 0)
        .attr('y', -10)
        .attr('font-size', '10px')
        .attr('font-weight', 'bold')
        .attr('fill', '#64748b')
        .text(() => {
          if (viewMode === 'kde') return '核密度强度';
          if (viewMode === 'flow_analysis') {
            return config.flowSubMode === 'custom_formula' ? '人流流向强度' : '人群聚集潜力';
          }
          if (viewMode === 'entropy') return '功能混合度 (Entropy)';
          if (viewMode === 'spatial_autocorrelation') return '空间自相关 (Moran\'s I)';
          if (viewMode === 'space_syntax') {
            return `空间句法: ${config.spaceSyntaxSubMode === 'connectivity' ? '连接度' : config.spaceSyntaxSubMode === 'integration' ? '集成度' : '选择度'}`;
          }
          if (viewMode === 'house_price') {
            const sub = config.housePriceSubMode;
            if (sub === 'heat') return '房价热力分布';
            if (sub === 'trend') return '房价趋势分析';
            if (sub === 'correlation') return '房价与POI相关性';
            if (sub === 'hotspot') return '房价热点分析 (Gi*)';
            if (sub === 'dbscan') return '高价小区空间聚类';
            if (sub === 'price') return '网格指标: 小区均价';
            if (sub === 'area') return '网格指标: 总建面';
            if (sub === 'plot_ratio') return '网格指标: 容积率';
            if (sub === 'green_ratio') return '网格指标: 绿化率';
            return '房价分析';
          }
          if (viewMode === 'street_view') {
            const sub = config.streetViewSubMode;
            if (sub === 'greenery') return '绿视率 (点数据)';
            if (sub === 'enclosure') return '围合度 (点数据)';
            if (sub === 'walkability') return '步行适宜性';
            if (sub === 'green_view') return '网格指标: 绿视率';
            if (sub === 'sky_view') return '网格指标: 天空开敞度';
            if (sub === 'continuity') return '网格指标: 界面连续度';
            if (sub === 'traffic') return '网格指标: 交通压力';
            if (sub === 'activity') return '网格指标: 街道活力';
            return '街景分析';
          }
          if (viewMode === 'traffic_analysis') return config.trafficSubMode === 'network' ? '路网结构强度' : '交通热力强度';
          if (config.heatSubMode === 'single' && config.singleFactorCategory) {
            return `${POI_LABELS[config.singleFactorCategory]} 分布`;
          }
          return '热力强度';
        });
    }

    // LISA Legend
    if (viewMode === 'spatial_autocorrelation' && config.spatialSubMode === 'lisa') {
      const legend = svg.append('g')
        .attr('transform', `translate(${width - 120}, ${height - 140})`);
      
      Object.entries(LISA_COLORS).forEach(([key, color], i) => {
        const row = legend.append('g').attr('transform', `translate(0, ${i * 20})`);
        row.append('rect').attr('width', 12).attr('height', 12).attr('fill', color).attr('rx', 2);
        row.append('text').attr('x', 20).attr('y', 10).attr('font-size', '10px').attr('fill', '#64748b').text(() => {
          if (key === 'HH') return '高-高 (热点)';
          if (key === 'LL') return '低-低 (冷点)';
          if (key === 'HL') return '高-低 (孤立)';
          if (key === 'LH') return '低-高 (包围)';
          return '不显著';
        });
      });
    }

  }, [
    data,
    config,
    boundary,
    mergedArea,
    roadNetworkData,
    roadGeoData,
    housePriceGridMetrics,
    streetViewGridMetrics,
    activityGridData,
    viewMode,
    selectedGridId,
    restrictToBoundary,
    displayData,
    visibleRoadFeatures
  ]);

  if (viewMode === 'location_analysis') {
    return (
      <div className="relative w-full h-full bg-slate-50 rounded-2xl overflow-hidden shadow-inner border border-slate-200">
        <MapContainer
          center={[31.18, 121.43]}
          zoom={12}
          className="w-full h-full"
          zoomControl={true}
          attributionControl={true}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='(C) OpenStreetMap contributors (C) CARTO'
          />

          {locationBounds && <FitLocationBounds bounds={locationBounds} />}

          {locationGridGeoWithId.features.length > 0 && (
            <GeoJSON
              key={`location-grid-${locationGridGeoWithId.features.length}`}
              data={locationGridGeoWithId as any}
              style={(feature: any) => {
                const isSelected = feature?.properties?.__gridId === selectedGridId;
                return {
                  color: isSelected ? '#ef4444' : '#94a3b8',
                  weight: isSelected ? 1.6 : 0.6,
                  fillColor: isSelected ? '#fecaca' : '#e2e8f0',
                  fillOpacity: isSelected ? 0.45 : 0.12
                };
              }}
              onEachFeature={(feature: any, layer: any) => {
                const gridId = feature?.properties?.__gridId;
                if (!gridId) return;
                layer.on('click', () => {
                  const target = displayData.find(d => d.id === gridId);
                  if (target) onGridClick(target);
                });
              }}
            />
          )}

          {activeLocationGeo && (
            <GeoJSON
              key={`location-boundary-${locationGeoKey}`}
              data={activeLocationGeo as any}
              style={{
                color: '#525252',
                weight: 2,
                fillColor: 'rgba(0,0,0,0)',
                fillOpacity: 0
              }}
            />
          )}

        </MapContainer>
      </div>
    );
  }

  if (viewMode === 'traffic_analysis' && config.trafficSubMode === 'network') {
    return (
      <div className="relative w-full h-full bg-slate-50 rounded-2xl overflow-hidden shadow-inner border border-slate-200">
        <MapContainer
          center={[31.18, 121.43]}
          zoom={12}
          className="w-full h-full"
          zoomControl={true}
          attributionControl={true}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution='(C) OpenStreetMap contributors (C) CARTO'
          />

          {trafficNetworkBounds && <FitLocationBounds bounds={trafficNetworkBounds} />}

          {locationBoundaryGeo && (
            <GeoJSON
              key="traffic-network-boundary"
              data={locationBoundaryGeo as any}
              style={{
                color: '#475569',
                weight: 2.2,
                fillColor: '#f8fafc',
                fillOpacity: 0.06,
              }}
            />
          )}

          {trafficRoadGeo && (
            <GeoJSON
              key={`traffic-network-roads-${trafficRoadGeo.features.length}`}
              data={trafficRoadGeo as any}
              style={(feature: any) => {
                const roadType = `${feature?.properties?.type || feature?.properties?.highway || ''}`;
                if (roadType.includes('高速') || roadType.includes('楂橀€熷叕璺') || roadType.toLowerCase().includes('motorway')) {
                  return { color: '#0f172a', weight: 3.2, opacity: 0.9 };
                }
                if (roadType.includes('主干') || roadType.includes('涓诲共') || roadType.toLowerCase().includes('trunk') || roadType.toLowerCase().includes('primary')) {
                  return { color: '#1e293b', weight: 2.6, opacity: 0.82 };
                }
                if (roadType.includes('次干') || roadType.includes('娆″共') || roadType.toLowerCase().includes('secondary')) {
                  return { color: '#334155', weight: 2, opacity: 0.74 };
                }
                return { color: '#64748b', weight: 1.25, opacity: 0.62 };
              }}
            />
          )}
        </MapContainer>

        {!trafficRoadGeo && (
          <div className="absolute left-4 bottom-4 px-3 py-2 rounded-xl bg-white/90 text-slate-600 text-xs border border-slate-200 shadow-sm">
            路网数据加载中或未命中徐汇区范围
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-slate-50 overflow-hidden">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};
