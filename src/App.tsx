import { useState, useEffect } from 'react';
import * as d3 from 'd3';
import { Map } from './components/Map';
import { Controls } from './components/Controls';
import { GridData, SimulationConfig, POICategories, MainMode, RoadNetworkRecord, LocationAreaMode, RoadFeatureCollection } from './types';
import { generateMockGrid, calculateTrafficHeat } from './services/simulation';
import { calculateRegionSelection } from './services/simulation';
import { Map as MapIcon, Info, Activity, Layers, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { correctGeoJSON } from './utils/coords';

const POI_LABELS: Record<string, string> = {
  CYMS: '餐饮美食',
  GSQY: '公司企业',
  GWXF: '购物消费',
  JTSS: '交通设施',
  JRJG: '金融机构',
  JDZS: '酒店住宿',
  KJWH: '科教文化',
  LYJD: '旅游景点',
  QCXG: '汽车相关',
  SWZZ: '商务住宅',
  SHFW: '生活服务',
  XXYL: '休闲娱乐',
  YLBJ: '医疗保健',
  YDJS: '运动健身'
};

export default function App() {
  const [gridData, setGridData] = useState<GridData[]>([]);
  const [boundary, setBoundary] = useState<any>(null);
  const [viewMode, setViewMode] = useState<MainMode>('heat');
  const [locationAreaMode, setLocationAreaMode] = useState<LocationAreaMode>('xuhui');
  const [config, setConfig] = useState<SimulationConfig>({
    weights: {
      CYMS: 1.0, GSQY: 1.0, GWXF: 1.0, JTSS: 1.0, JRJG: 1.0,
      JDZS: 1.0, KJWH: 1.0, LYJD: 1.0, QCXG: 1.0, SWZZ: 1.0,
      SHFW: 1.0, XXYL: 1.0, YLBJ: 1.0, YDJS: 1.0
    },
    customFormula: {
      traffic: 1.0,
      commercial: 1.0,
      purchasing: 1.0,
      youth: 1.0
    },
    events: [],
    multiFactorCategories: ['CYMS', 'GWXF', 'XXYL'],
    kdeCategories: ['CYMS'],
    flowCategories: ['CYMS', 'JTSS'],
    aggregationCategories: ['CYMS', 'GWXF'],
    moranCategories: ['CYMS'],
    lisaCategories: ['CYMS'],
    entropyCategories: ['CYMS', 'GWXF', 'SHFW', 'KJWH', 'XXYL'],
    dbscanCategories: ['CYMS'],
    heatSubMode: 'simulation',
    flowSubMode: 'custom_formula',
    spatialSubMode: 'moran',
    spaceSyntaxSubMode: 'connectivity',
    housePriceSubMode: 'price',
    streetViewSubMode: 'green_view',
    activitySubMode: 'distribution',
    trafficSubMode: 'heat',
    factorSubMode: 'importance',
    isSimulationActive: false,
    simulationStep: 0,
    singleFactorCategory: 'CYMS',
    regionSelectionThreshold: 52,
    regionSelectionMinRatio: 0.01
  });
  const [mergedArea, setMergedArea] = useState<any>(null);
  const [selectedGrid, setSelectedGrid] = useState<GridData | null>(null);
  const [restrictToBoundary, setRestrictToBoundary] = useState<boolean>(false);
  const [housePriceGridMetrics, setHousePriceGridMetrics] = useState<any[]>([]);
  const [streetViewGridMetrics, setStreetViewGridMetrics] = useState<any[]>([]);
  const [activityGridData, setActivityGridData] = useState<any[]>([]);
  const [roadNetworkData, setRoadNetworkData] = useState<RoadNetworkRecord[]>([]);
  const [roadGeoData, setRoadGeoData] = useState<RoadFeatureCollection | null>(null);

  const dataUrl = (relativePath: string) => `${import.meta.env.BASE_URL}${relativePath.replace(/^\//, '')}`;
  const fetchJsonWithFallback = async (apiPath: string, staticPath: string) => {
    const staticUrl = dataUrl(staticPath);
    const useStaticFirst = import.meta.env.PROD;

    const primary = useStaticFirst ? staticUrl : apiPath;
    const secondary = useStaticFirst ? apiPath : staticUrl;

    let res = await fetch(primary);
    if (!res.ok) {
      res = await fetch(secondary);
    }
    return res;
  };

  const fetchTextFromBase = async (relativePath: string) => {
    return fetch(dataUrl(relativePath));
  };

  useEffect(() => {
    let interval: any;
    if (config.isSimulationActive) {
      // Reset to 0 when starting
      setConfig(prev => ({ ...prev, simulationStep: 0 }));
      
      interval = setInterval(() => {
        setConfig(prev => {
          const nextStep = prev.simulationStep + 1;
          if (nextStep > 10) {
            return { ...prev, simulationStep: 0 };
          }
          return { ...prev, simulationStep: nextStep };
        });
      }, 400); // Slightly faster for smoother feel
    } else {
      setConfig(prev => ({ ...prev, simulationStep: 0 }));
    }
    return () => clearInterval(interval);
  }, [config.isSimulationActive]);

  const handleGridClick = (grid: GridData) => {
    setSelectedGrid(prev => prev?.id === grid.id ? null : grid);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch boundary
        const boundaryRes = await fetchJsonWithFallback('/api/data/boundary', '/api/data/boundary.json');
        if (boundaryRes.ok) {
          let boundaryData = await boundaryRes.json();
          boundaryData = correctGeoJSON(boundaryData);
          setBoundary(boundaryData);
        }

        // Fetch POI diversity
        const poiRes = await fetchJsonWithFallback('/api/data/poi-diversity', '/api/data/poi-diversity.json');
        if (poiRes.ok) {
          let poiData = await poiRes.json();
          // Apply coordinate correction
          poiData = correctGeoJSON(poiData);
          
          // Map features to GridData
          const mappedData: GridData[] = poiData.features.map((f: any, idx: number) => {
            const props = f.properties;
            
            // Handle both Point and Polygon geometries
            let x = 0;
            let y = 0;
            
            if (f.geometry.type === 'Point') {
              x = f.geometry.coordinates[0];
              y = f.geometry.coordinates[1];
            } else if (f.geometry.type === 'Polygon') {
              // Average coordinates of the outer ring
              const ring = f.geometry.coordinates[0];
              x = d3.mean(ring, (d: any) => d[0]) || 0;
              y = d3.mean(ring, (d: any) => d[1]) || 0;
            } else if (f.geometry.type === 'MultiPolygon') {
              // Average all coordinates from all polygons
              const allPoints = f.geometry.coordinates.flat(2);
              x = d3.mean(allPoints, (d: any) => d[0]) || 0;
              y = d3.mean(allPoints, (d: any) => d[1]) || 0;
            }
            
            return {
              id: `grid-${idx}`,
              x: x,
              y: y,
              pois: {
                CYMS: props.CYMS || 0,
                GSQY: props.GSQY || 0,
                GWXF: props.GWXF || 0,
                JTSS: props.JTSS || 0,
                JRJG: props.JRJG || 0,
                JDZS: props.JDZS || 0,
                KJWH: props.KJWH || 0,
                LYJD: props.LYJD || 0,
                QCXG: props.QCXG || 0,
                SWZZ: props.SWZZ || 0,
                SHFW: props.SHFW || 0,
                XXYL: props.XXYL || 0,
                YLBJ: props.YLBJ || 0,
                YDJS: props.YDJS || 0
              },
              baseHeat: props.diversity || 0,
              feature: f
            };
          });
          setGridData(mappedData);

        // Fetch merged-area geojson if available
        try {
          const mergedRes = await fetchJsonWithFallback('/api/data/merged-area', '/api/data/merged-area.json');
          if (mergedRes.ok) {
            let mergedData = await mergedRes.json();
            // merged-area.geojson 已采用 CRS84 (WGS84 lon/lat)，
            // 不对其执行地理坐标纠偏以避免坐标被错误平移。
            setMergedArea(mergedData);
          }
        } catch (err) {
          // ignore
        }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        const mockData = generateMockGrid(30, 30);
        setGridData(mockData);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const fetchGridMetrics = async () => {
      try {
        const hpRes = await fetchTextFromBase('/Xuhui_houseprice_grid_metrics.csv');
        if (hpRes.ok) {
          const text = await hpRes.text();
          const data = d3.csvParse(text);
          setHousePriceGridMetrics(data);
        }

        const svRes = await fetchTextFromBase('/Xuhui_streetview_grid_metrics.csv');
        if (svRes.ok) {
          const text = await svRes.text();
          const data = d3.csvParse(text);
          setStreetViewGridMetrics(data);
        }

        const actRes = await fetchTextFromBase('/Xuhui_activity_grid.csv');
        if (actRes.ok) {
          const text = await actRes.text();
          const data = d3.csvParse(text);
          setActivityGridData(data);
        }

        const roadRes = await fetchTextFromBase('/Xuhui_Road_Network_Data_Fixed.csv');
        if (roadRes.ok) {
          const text = await roadRes.text();
          const rows = d3.csvParseRows(text);
          if (rows.length > 1) {
            const body = rows.slice(1);
            const parsed: RoadNetworkRecord[] = body.map((row, idx) => {
              const startNodeId = row[0] || '';
              const endNodeId = row[1] || '';
              const roadName = row[2] || '';
              const functionalClass = (row[3] || row[8] || 'unknown').toString();
              const direction = (row[4] || '').toString();
              const lanes = (row[5] || '').toString();
              const length = parseFloat(row[6] || '0') || 0;
              const speed = parseFloat(row[7] || '0') || 0;
              const osmTag = (row[8] || '').toString();

              const laneNums = lanes
                .split('/')
                .map(v => parseFloat(v))
                .filter(v => Number.isFinite(v) && v > 0);
              const laneCount = laneNums.length > 0 ? d3.mean(laneNums)! : 1;
              const directionWeight = direction.includes('双') ? 1.2 : direction.includes('单') ? 1.0 : 0.9;
              const flowScore = laneCount * directionWeight;

              return {
                startNodeId,
                endNodeId,
                roadName,
                functionalClass,
                direction,
                lanes,
                length,
                speed,
                osmTag,
                flowScore
              };
            }).filter(d => d.startNodeId && d.endNodeId);
            setRoadNetworkData(parsed);
          }
        }

        const roadGeoRes = await fetchJsonWithFallback('/api/data/roads', '/api/data/roads.json');
        if (roadGeoRes.ok) {
          const roadGeoJson = await roadGeoRes.json();
          if (Array.isArray(roadGeoJson?.features) && roadGeoJson.features.length > 0) {
            setRoadGeoData({
              type: 'FeatureCollection',
              features: roadGeoJson.features
            });
          }
        }
      } catch (error) {
        console.error('Error loading grid metrics:', error);
      }
    };
    fetchGridMetrics();
  }, []);

  const updateGridPOI = (id: string, category: string, value: number) => {
    setGridData(prev => prev.map(cell => {
      if (cell.id === id) {
        return {
          ...cell,
          pois: { ...cell.pois, [category]: value }
        };
      }
      return cell;
    }));
    if (selectedGrid && selectedGrid.id === id) {
      setSelectedGrid(prev => prev ? {
        ...prev,
        pois: { ...prev.pois, [category]: value }
      } : null);
    }
  };

  useEffect(() => {
    (window as any).currentGridData = gridData;
    (window as any).activityGridData = activityGridData;
    (window as any).housePriceGridMetrics = housePriceGridMetrics;
    (window as any).streetViewGridMetrics = streetViewGridMetrics;
  }, [gridData, activityGridData, housePriceGridMetrics, streetViewGridMetrics]);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar / Controls */}
      <Controls 
        config={config} 
        setConfig={setConfig}
        viewMode={viewMode}
        setViewMode={setViewMode}
        locationAreaMode={locationAreaMode}
        setLocationAreaMode={setLocationAreaMode}
        restrictToBoundary={restrictToBoundary}
        setRestrictToBoundary={setRestrictToBoundary}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {config.isSimulationActive && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-amber-500 text-white rounded-full shadow-lg font-bold text-xs flex items-center gap-2 animate-pulse">
            <Zap className="w-4 h-4" />
            特殊事件模拟中: {config.simulationStep * 10}%
          </div>
        )}
        {/* Header */}
        <header className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-8 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-200">
              <MapIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-slate-900">徐汇区分析模拟平台</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">Xuhui Urban Dynamics Simulation</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider border ${gridData.length > 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
              <span className="relative flex h-2 w-2">
                <span className={`${gridData.length > 0 ? 'animate-ping' : ''} absolute inline-flex h-full w-full rounded-full ${gridData.length > 0 ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${gridData.length > 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
              </span>
              {gridData.length > 0 ? `模拟环境已就绪 (${gridData.length} 个单元)` : '正在加载空间数据...'}
            </div>
          </div>
        </header>

        {/* Map Area */}
        <div id="analysis-map-container" className="flex-1 relative min-h-0 flex flex-col bg-white">
          <Map 
            data={gridData} 
            config={config} 
            boundary={boundary}
            mergedArea={mergedArea}
            restrictToBoundary={restrictToBoundary}
            roadNetworkData={roadNetworkData}
            roadGeoData={roadGeoData || undefined}
            housePriceGridMetrics={housePriceGridMetrics}
            streetViewGridMetrics={streetViewGridMetrics}
            activityGridData={activityGridData}
            onGridClick={handleGridClick}
            viewMode={viewMode}
            locationAreaMode={locationAreaMode}
            selectedGridId={selectedGrid?.id}
          />

          {/* Info Overlay */}
          {selectedGrid && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="absolute top-4 right-4 w-72 bg-white/95 backdrop-blur-xl p-4 rounded-3xl shadow-2xl border border-white/20 z-30 max-h-[70vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-6 sticky top-0 bg-white/50 backdrop-blur-sm py-2 z-10">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">网格统计分析</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">单元 ID: {selectedGrid.id}</p>
                </div>
                <button 
                  onClick={() => setSelectedGrid(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <Info className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">网格编号</span>
                  <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                    {selectedGrid.id}
                  </span>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">POI 数量手动调节</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {(() => {
                      let displayPois: [string, number][] = [];
                      const allPois = Object.entries(selectedGrid.pois) as [string, number][];
                      
                      if (viewMode === 'heat') {
                        if (config.heatSubMode === 'simulation') {
                          displayPois = allPois;
                        } else if (config.heatSubMode === 'multi') {
                          displayPois = allPois.filter(([key]) => config.multiFactorCategories?.includes(key as keyof POICategories));
                        } else {
                          displayPois = [[config.singleFactorCategory || 'CYMS', selectedGrid.pois[(config.singleFactorCategory || 'CYMS') as keyof POICategories]]];
                        }
                      } else if (viewMode === 'kde') {
                        displayPois = allPois.filter(([key]) => config.kdeCategories?.includes(key as keyof POICategories));
                      } else if (viewMode === 'flow_analysis') {
                        if (config.flowSubMode === 'custom_formula') {
                          displayPois = allPois.filter(([key]) => config.flowCategories?.includes(key as keyof POICategories));
                        } else {
                          displayPois = allPois.filter(([key]) => config.aggregationCategories?.includes(key as keyof POICategories));
                        }
                      } else if (viewMode === 'spatial_autocorrelation') {
                        if (config.spatialSubMode === 'moran') {
                          displayPois = allPois.filter(([key]) => config.moranCategories?.includes(key as keyof POICategories));
                        } else {
                          displayPois = allPois.filter(([key]) => config.lisaCategories?.includes(key as keyof POICategories));
                        }
                      } else if (viewMode === 'entropy') {
                        displayPois = allPois.filter(([key]) => config.entropyCategories?.includes(key as keyof POICategories));
                      } else if (viewMode === 'dbscan') {
                        displayPois = allPois.filter(([key]) => config.dbscanCategories?.includes(key as keyof POICategories));
                      } else if (viewMode === 'house_price') {
                        const idx = gridData.indexOf(selectedGrid);
                        const metrics = housePriceGridMetrics[idx];
                        if (!metrics) return <p className="text-[9px] text-slate-400 italic">暂无房价指标数据</p>;
                        return (
                          <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-2">
                            <p className="text-[10px] font-bold text-emerald-600 uppercase">房价分析指标</p>
                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">小区均价:</span>
                                <span className="font-bold text-emerald-700">{metrics['小区均价'] || '0'} 元/㎡</span>
                              </div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">总建面:</span>
                                <span className="font-bold text-emerald-700">{metrics['总建面'] || '0'} ㎡</span>
                              </div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">容积率:</span>
                                <span className="font-bold text-emerald-700">{metrics['容积率'] || '0'}</span>
                              </div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">绿化率:</span>
                                <span className="font-bold text-emerald-700">{metrics['绿化率'] || '0'}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      } else if (viewMode === 'street_view') {
                        const idx = gridData.indexOf(selectedGrid);
                        const metrics = streetViewGridMetrics[idx];
                        if (!metrics) return <p className="text-[9px] text-slate-400 italic">暂无街景指标数据</p>;
                        return (
                          <div className="p-3 bg-cyan-50 rounded-2xl border border-cyan-100 space-y-2">
                            <p className="text-[10px] font-bold text-cyan-600 uppercase">街景语义指标</p>
                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">绿视率:</span>
                                <span className="font-bold text-cyan-700">{(parseFloat(metrics.green_view || 0) * 100).toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">天空开敞度:</span>
                                <span className="font-bold text-cyan-700">{(parseFloat(metrics.sky_view || 0) * 100).toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">界面连续度:</span>
                                <span className="font-bold text-cyan-700">{(parseFloat(metrics.interface_continuity || 0) * 100).toFixed(1)}%</span>
                              </div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">步行适宜度:</span>
                                <span className="font-bold text-cyan-700">{(parseFloat(metrics.walkability || 0) * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      } else if (viewMode === 'activity_analysis') {
                        const idx = gridData.indexOf(selectedGrid);
                        const metrics = activityGridData[idx];
                        if (!metrics) return <p className="text-[9px] text-slate-400 italic">暂无活动指标数据</p>;
                        return (
                          <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100 space-y-2">
                            <p className="text-[10px] font-bold text-rose-600 uppercase">城市活动指标</p>
                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">活动强度 (Count):</span>
                                <span className="font-bold text-rose-700">{metrics.activity_count || '0'}</span>
                              </div>
                              <p className="text-[9px] text-slate-400 italic mt-2">
                                数据来源于 Xuhui_activity_grid.csv，反映该网格内的历史活动频次。
                              </p>
                            </div>
                          </div>
                        );
                      } else if (viewMode === 'traffic_analysis') {
                        const idx = gridData.indexOf(selectedGrid);
                        if (idx < 0) return <p className="text-[9px] text-slate-400 italic">未找到网格索引</p>;

                        // Recompute traffic heat values for current data + road network (fast enough for single read)
                        const trafficValues = calculateTrafficHeat(gridData, roadNetworkData || []);
                        const trafficValue = trafficValues[idx] || 0;
                        const streetMetrics = streetViewGridMetrics[idx] || {};

                        return (
                          <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-2">
                            <p className="text-[10px] font-bold text-indigo-600 uppercase">交通网格指标</p>
                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">交通设施强度 (JTSS):</span>
                                <span className="font-bold text-indigo-700">{selectedGrid.pois.JTSS || 0}</span>
                              </div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">交通热力值:</span>
                                <span className="font-bold text-indigo-700">{trafficValue.toFixed(3)}</span>
                              </div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-slate-500">街景交通压力:</span>
                                <span className="font-bold text-indigo-700">{(parseFloat(streetMetrics.traffic_pressure || '0')).toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      } else if (viewMode === 'region_selection') {
                        const idx = gridData.findIndex(g => g.id === selectedGrid.id);
                        if (idx < 0) return <p className="text-[9px] text-slate-400 italic">未找到网格索引</p>;

                        const thresholdPct = config.regionSelectionThreshold ?? 52;
                        const threshold = thresholdPct / 100;
                        const minRatio = config.regionSelectionMinRatio ?? 0.01;
                        const { values: regionValues, idealRanges } = calculateRegionSelection(
                          gridData,
                          activityGridData,
                          housePriceGridMetrics,
                          streetViewGridMetrics,
                          threshold
                        );

                        const sorted = [...regionValues].sort((a, b) => a - b);
                        const minCount = Math.max(1, Math.ceil(regionValues.length * Math.max(0.01, Math.min(0.95, minRatio))));
                        const selectedCount = regionValues.filter(v => v >= threshold).length;
                        const rankIdx = Math.max(0, sorted.length - minCount);
                        const ratioThreshold = Number(sorted[rankIdx] ?? threshold);
                        const effectiveThreshold = selectedCount >= minCount ? threshold : Math.min(threshold, ratioThreshold);

                        const houseMetrics = housePriceGridMetrics[idx] || {};
                        const streetMetrics = streetViewGridMetrics[idx] || {};
                        const activityMetrics = activityGridData[idx] || {};
                        const currentValues: Record<string, number> = {
                          poi_density: d3.sum(Object.values(selectedGrid.pois)),
                          traffic_poi: selectedGrid.pois.JTSS || 0,
                          traffic_pressure: parseFloat(streetMetrics.traffic_pressure || 'NaN'),
                          green_view: parseFloat(streetMetrics.green_view || 'NaN'),
                          sky_view: parseFloat(streetMetrics.sky_view || 'NaN'),
                          continuity: parseFloat(streetMetrics.interface_continuity || 'NaN'),
                          walkability: parseFloat(streetMetrics.walkability || 'NaN'),
                          house_price: parseFloat(houseMetrics['小区均价'] || 'NaN')
                        };

                        const labelMap: Record<string, string> = {
                          poi_density: 'POI 密度',
                          traffic_poi: '交通设施强度',
                          traffic_pressure: '交通压力',
                          green_view: '绿视率',
                          sky_view: '天空开敞度',
                          continuity: '界面连续度',
                          walkability: '步行适宜度',
                          house_price: '房价水平'
                        };

                        const score = regionValues[idx] || 0;
                        const isSelected = score >= effectiveThreshold;

                        return (
                          <div className="p-3 bg-red-50 rounded-2xl border border-red-100 space-y-2">
                            <p className="text-[10px] font-bold text-red-600 uppercase">区域选择指标详情</p>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-slate-500">匹配得分:</span>
                              <span className="font-bold text-red-700">{(score * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-slate-500">生效阈值:</span>
                              <span className="font-bold text-red-700">{(effectiveThreshold * 100).toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-slate-500">是否选中:</span>
                              <span className={`font-bold ${isSelected ? 'text-red-700' : 'text-slate-500'}`}>{isSelected ? '是' : '否'}</span>
                            </div>
                            <div className="pt-2 border-t border-red-100 space-y-1">
                              {Object.entries(idealRanges).map(([key, range]: [string, any]) => {
                                const value = currentValues[key];
                                const hasValue = Number.isFinite(value);
                                const inRange = hasValue && value >= range.min && value <= range.max;
                                return (
                                  <div key={key} className="flex justify-between text-[9px]">
                                    <span className="text-slate-500">{labelMap[key] || key}:</span>
                                    <span className={`font-bold ${inRange ? 'text-red-700' : 'text-slate-600'}`}>
                                      {hasValue ? value.toFixed(2) : 'NA'} / [{range.min.toFixed(2)}-{range.max.toFixed(2)}]
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="text-[9px] text-slate-400 italic">activity: {activityMetrics.activity_count || '0'}</div>
                          </div>
                        );
                      }
                      
                      return displayPois.map(([key, val]) => (
                        <div 
                          key={key} 
                          className={`p-2 rounded-xl border transition-all ${viewMode === key ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-100' : 'bg-slate-50 border-slate-100'}`}
                        >
                          <p className={`text-[9px] uppercase font-bold tracking-wider mb-1 ${viewMode === key ? 'text-indigo-600' : 'text-slate-400'}`}>
                            {POI_LABELS[key] || key}
                            {viewMode === key && ' (当前视图)'}
                          </p>
                          <input
                            type="number"
                            value={val}
                            onChange={(e) => updateGridPOI(selectedGrid.id, key, parseFloat(e.target.value) || 0)}
                            className="bg-transparent font-mono text-sm font-bold text-slate-700 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1"
                          />
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
