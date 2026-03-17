import React from 'react';
import * as d3 from 'd3';
import { SimulationConfig, EventData, GridData, ViewMode, POICategories, MainMode, HeatSubMode, POI_LABELS, LocationAreaMode } from '../types';
import { Sliders, Plus, Trash2, Zap, Layers, CheckSquare, Square, Download, Navigation, Users, Play } from 'lucide-react';
import { calculateGlobalMoran, calculateRegionSelection } from '../services/simulation';
import { domToCanvas } from 'modern-screenshot';

interface ControlsProps {
  config: SimulationConfig;
  setConfig: React.Dispatch<React.SetStateAction<SimulationConfig>>;
  viewMode: MainMode;
  setViewMode: (mode: MainMode) => void;
  locationAreaMode: LocationAreaMode;
  setLocationAreaMode: (mode: LocationAreaMode) => void;
  restrictToBoundary: boolean;
  setRestrictToBoundary: (v: boolean) => void;
}

export const Controls: React.FC<ControlsProps> = ({ config, setConfig, viewMode, setViewMode, locationAreaMode, setLocationAreaMode, restrictToBoundary, setRestrictToBoundary }) => {
  const [draftEvent, setDraftEvent] = React.useState<EventData | null>(null);
  const [isExporting, setIsExporting] = React.useState(false);

  const updateWeight = (key: string, value: number) => {
    setConfig(prev => ({
      ...prev,
      weights: { ...prev.weights, [key]: value }
    }));
  };

  const estimateGridSpacingMeters = (gridData: GridData[]): number => {
    if (!gridData || gridData.length < 2) return 300;
    const sampleCount = Math.min(80, gridData.length);
    let sumNearest = 0;
    let validCount = 0;

    for (let i = 0; i < sampleCount; i++) {
      const current = gridData[i];
      let nearest = Infinity;
      for (let j = 0; j < gridData.length; j++) {
        if (i === j) continue;
        const other = gridData[j];
        const dist = Math.sqrt((current.x - other.x) ** 2 + (current.y - other.y) ** 2) * 111320;
        if (dist > 0 && dist < nearest) nearest = dist;
      }
      if (Number.isFinite(nearest)) {
        sumNearest += nearest;
        validCount++;
      }
    }

    if (validCount === 0) return 300;
    return Math.max(80, sumNearest / validCount);
  };

  const getGridCenter = (gridData: GridData[]) => {
    if (!gridData || gridData.length === 0) return { x: 121.43, y: 31.18 };
    return {
      x: d3.mean(gridData, d => d.x) || 121.43,
      y: d3.mean(gridData, d => d.y) || 31.18
    };
  };

  const startAddEvent = () => {
    const gridData = (window as any).currentGridData as GridData[];
    const center = getGridCenter(gridData || []);
    const spacing = estimateGridSpacingMeters(gridData || []);

    setDraftEvent({
      id: Math.random().toString(36).substr(2, 9),
      name: `模拟事件 ${config.events.length + 1}`,
      x: center.x,
      y: center.y,
      radius: spacing,
      intensity: 10,
      gridId: '',
      category: 'CYMS',
      scope: 'grid',
      effect: 'percent',
      gridRange: 1
    });
  };

  const confirmAddEvent = () => {
    if (!draftEvent) return;

    const gridData = (window as any).currentGridData as GridData[];
    const spacing = estimateGridSpacingMeters(gridData || []);
    let finalEvent = { ...draftEvent };
    const scope = draftEvent.scope || 'grid';

    if (scope === 'global') {
      const center = getGridCenter(gridData || []);
      finalEvent.x = center.x;
      finalEvent.y = center.y;
      finalEvent.gridId = '';
      finalEvent.radius = 0;
    } else if (draftEvent.gridId) {
      const fullGridId = draftEvent.gridId;
      const targetGrid = gridData?.find(g => g.id === fullGridId);
      if (targetGrid) {
        finalEvent.x = targetGrid.x;
        finalEvent.y = targetGrid.y;
        finalEvent.gridId = fullGridId;
      }
      if (scope === 'region') {
        finalEvent.radius = Math.max(1, draftEvent.gridRange || 1) * spacing;
      }
    }

    if (scope === 'grid') {
      finalEvent.radius = Math.max(80, Math.min(spacing, finalEvent.radius || spacing));
    }

    setConfig(prev => ({
      ...prev,
      events: [...prev.events, finalEvent]
    }));
    setDraftEvent(null);
  };

  const removeEvent = (id: string) => {
    setConfig(prev => ({
      ...prev,
      events: prev.events.filter(e => e.id !== id)
    }));
  };

  const updateEvent = (id: string, updates: Partial<EventData>) => {
    setConfig(prev => ({
      ...prev,
      events: prev.events.map(e => e.id === id ? { ...e, ...updates } : e)
    }));
  };

  const renderCategorySelector = (mode: keyof SimulationConfig, label: string, color: string) => {
    const categories = (config[mode] as (keyof POICategories)[]) || [];
    return (
      <div className={`p-3 bg-${color}-50 rounded-2xl border border-${color}-100 space-y-3`}>
        <h3 className={`text-[10px] font-bold text-${color}-600 uppercase tracking-widest`}>{label}</h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(POI_LABELS).map(([key, label]) => {
            const isSelected = categories.includes(key as keyof POICategories);
            return (
              <button
                key={key}
                onClick={() => {
                  let next;
                  if (isSelected) {
                    next = categories.filter(c => c !== key);
                  } else {
                    next = [...categories, key as keyof POICategories].slice(-5);
                  }
                  setConfig(prev => ({ ...prev, [mode]: next }));
                }}
                className={`flex items-center gap-2 p-1.5 rounded-lg text-[9px] font-bold transition-all ${isSelected ? `bg-${color}-600 text-white shadow-sm` : 'bg-white text-slate-500 border border-slate-100'}`}
              >
                {isSelected ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const handleExport = async () => {
    const mapElement = document.getElementById('analysis-map-container');
    if (!mapElement) return;

    setIsExporting(true);
    try {
      const canvas = await domToCanvas(mapElement, {
        scale: 2,
        backgroundColor: '#ffffff',
      });

      const finalCanvas = document.createElement('canvas');
      const padding = 40;
      const metaHeight = 160;
      finalCanvas.width = canvas.width;
      finalCanvas.height = canvas.height + metaHeight;
      const ctx = finalCanvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
      ctx.drawImage(canvas, 0, 0);

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 24px sans-serif';
      const modeLabels: Record<string, string> = {
        heat: '热力分析',
        traffic_analysis: '交通分析',
        kde: '核密度分析',
        house_price: '房价分析',
        street_view: '街景分析',
        activity_analysis: '活动分析',
        spatial_autocorrelation: '空间自相关',
        entropy: '功能混合度',
        dbscan: '聚类识别',
        space_syntax: '空间句法',
        factor_importance: '因子测度',
        flow_analysis: '人流预测模拟'
      };
      ctx.fillText(`分析报告: ${modeLabels[viewMode] || viewMode}`, padding, canvas.height + 40);

      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#64748b';
      const date = new Date().toLocaleString();
      ctx.fillText(`导出时间: ${date}`, padding, canvas.height + 70);

      let params = '';
      if (viewMode === 'heat') {
        params = `模式: ${config.heatSubMode === 'simulation' ? '综合模拟' : config.heatSubMode === 'multi' ? '多因子' : '单因子'}`;
        if (config.heatSubMode === 'multi') {
          params += ` | 因子: ${config.multiFactorCategories?.map(c => POI_LABELS[c]).join(', ')}`;
        } else if (config.heatSubMode === 'single') {
          params += ` | 因子: ${POI_LABELS[config.singleFactorCategory || 'CYMS']}`;
        }
      } else if (viewMode === 'kde') {
        params = `因子: ${config.kdeCategories?.map(c => POI_LABELS[c]).join(', ')}`;
      } else if (viewMode === 'flow_analysis') {
        if (config.flowSubMode === 'custom_formula') {
          params = `子模式: 人流流向 | 因子: ${config.flowCategories?.map(c => POI_LABELS[c]).join(', ')}`;
        } else {
          params = `子模式: 人群聚集 | 因子: ${config.aggregationCategories?.map(c => POI_LABELS[c]).join(', ')}`;
        }
      } else if (viewMode === 'spatial_autocorrelation') {
        if (config.spatialSubMode === 'moran') {
          params = `子模式: 全局 Moran's I | 因子: ${config.moranCategories?.map(c => POI_LABELS[c]).join(', ')}`;
        } else {
          params = `子模式: 局部 LISA | 因子: ${config.lisaCategories?.map(c => POI_LABELS[c]).join(', ')}`;
        }
      } else if (viewMode === 'entropy') {
        params = `因子: ${config.entropyCategories?.map(c => POI_LABELS[c]).join(', ')}`;
      } else if (viewMode === 'dbscan') {
        params = `因子: ${config.dbscanCategories?.map(c => POI_LABELS[c]).join(', ')}`;
      }
      ctx.fillText(`参数信息: ${params}`, padding, canvas.height + 95);

      const link = document.createElement('a');
      link.download = `urban-analysis-${viewMode}-${Date.now()}.png`;
      link.href = finalCanvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const canConfirmDraftEvent = draftEvent
    ? (draftEvent.scope === 'global' || Boolean(draftEvent.gridId))
    : false;

  return (
    <div className="flex flex-col gap-6 p-6 bg-white border-r border-slate-200 h-full overflow-y-auto w-80 shadow-lg z-20">
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wider">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h2>分析模式</h2>
          </div>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-all text-[10px] font-bold disabled:opacity-50"
          >
            <Download className="w-3 h-3" />
            {isExporting ? '导出中...' : '导出图片'}
          </button>
        </div>
        
      {/* Top Level Categories */}
      <div className="space-y-8">
        {/* Category 1: Data Visualization */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">数据可视化</h3>
          <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-100 rounded-xl">
            <button
              onClick={() => setViewMode('location_analysis')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'location_analysis' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              📍 区位分析
            </button>
            <button
              onClick={() => setViewMode('traffic_analysis')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'traffic_analysis' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🚗 交通分析
            </button>
            <button
              onClick={() => setViewMode('heat')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'heat' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🔥 热力分析
            </button>
            <button
              onClick={() => setViewMode('kde')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'kde' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              📊 核密度分析
            </button>
            <button
              onClick={() => setViewMode('house_price')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'house_price' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🏠 房价分析
            </button>
            <button
              onClick={() => setViewMode('street_view')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'street_view' ? 'bg-white text-cyan-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🏙️ 街景分析
            </button>
            <button
              onClick={() => setViewMode('activity_analysis')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'activity_analysis' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🏃 活动分析
            </button>
          </div>
        </div>

        {/* Category 2: Data Analysis */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">数据分析</h3>
          <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-100 rounded-xl">
            <button
              onClick={() => setViewMode('spatial_autocorrelation')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'spatial_autocorrelation' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🌐 空间自相关
            </button>
            <button
              onClick={() => setViewMode('entropy')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'entropy' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🧬 混合度
            </button>
            <button
              onClick={() => setViewMode('dbscan')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'dbscan' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              💎 聚类识别
            </button>
            <button
              onClick={() => setViewMode('space_syntax')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'space_syntax' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              📐 空间句法
            </button>
            <button
              onClick={() => setViewMode('factor_importance')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'factor_importance' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🎯 因子测度
            </button>
            <button
              onClick={() => setViewMode('region_selection')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'region_selection' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🔍 区域选择
            </button>
          </div>
        </div>

        {/* Category 3: Simulation & Prediction */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">模拟预测</h3>
          <div className="grid grid-cols-1 gap-1.5 p-1.5 bg-slate-100 rounded-xl">
            <button
              onClick={() => setViewMode('flow_analysis')}
              className={`py-2 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'flow_analysis' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🌊 人流预测模拟
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6 mt-4">
          {viewMode === 'location_analysis' && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setLocationAreaMode('xuhui')}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${locationAreaMode === 'xuhui' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  徐汇区
                </button>
                <button
                  onClick={() => setLocationAreaMode('greater_xujiahui')}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${locationAreaMode === 'greater_xujiahui' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  大徐家汇区域
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <label htmlFor="restrict-boundary" className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    id="restrict-boundary"
                    type="checkbox"
                    checked={restrictToBoundary}
                    onChange={(e) => setRestrictToBoundary(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-200"
                  />
                  <span className="text-[12px] font-bold">仅显示徐汇区内网格</span>
                </label>
              </div>
            </div>
          )}

          {viewMode === 'heat' && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, heatSubMode: 'single' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.heatSubMode === 'single' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  单因子
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, heatSubMode: 'multi' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.heatSubMode === 'multi' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  多因子
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, heatSubMode: 'simulation' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.heatSubMode === 'simulation' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  综合模拟
                </button>
              </div>

              {config.heatSubMode === 'single' && (
                <select
                  value={config.singleFactorCategory}
                  onChange={(e) => setConfig(prev => ({ ...prev, singleFactorCategory: e.target.value as keyof POICategories }))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Object.entries(POI_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              )}

              {config.heatSubMode === 'multi' && renderCategorySelector('multiFactorCategories', '选择叠加因子', 'indigo')}
            </div>
          )}

          {viewMode === 'kde' && renderCategorySelector('kdeCategories', '选择 KDE 因子', 'purple')}
          
          {viewMode === 'flow_analysis' && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, flowSubMode: 'custom_formula' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.flowSubMode === 'custom_formula' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  自定义公式
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, flowSubMode: 'ml_driven' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.flowSubMode === 'ml_driven' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  机器学习驱动
                </button>
              </div>
              
              {config.flowSubMode === 'custom_formula' && (
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 space-y-3">
                  <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">S = w1·Traffic + w2·Comm + w3·Purch + w4·Youth</h4>
                  <div className="space-y-2">
                    {[
                      { key: 'traffic', label: 'w1 交通设施' },
                      { key: 'commercial', label: 'w2 商业设施' },
                      { key: 'purchasing', label: 'w3 消费能力' },
                      { key: 'youth', label: 'w4 青年活力' }
                    ].map(item => (
                      <div key={item.key} className="space-y-1">
                        <div className="flex justify-between text-[9px] font-bold text-emerald-600">
                          <span>{item.label}</span>
                          <span>{config.customFormula[item.key as keyof typeof config.customFormula].toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="5"
                          step="0.1"
                          value={config.customFormula[item.key as keyof typeof config.customFormula]}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            customFormula: { ...prev.customFormula, [item.key]: parseFloat(e.target.value) }
                          }))}
                          className="w-full h-1 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {viewMode === 'spatial_autocorrelation' && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, spatialSubMode: 'moran' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.spatialSubMode === 'moran' ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  全局 Moran's I
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, spatialSubMode: 'lisa' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.spatialSubMode === 'lisa' ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  局部 LISA
                </button>
              </div>
              {config.spatialSubMode === 'moran' ? (
                <div className="space-y-4">
                  {renderCategorySelector('moranCategories', '选择自相关因子', 'amber')}
                  <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100">
                    <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">全局 Moran's I 指数</p>
                    <p className="text-lg font-bold text-amber-700">
                      {(() => {
                        const gridData = (window as any).currentGridData;
                        if (gridData && gridData.length > 0 && config.moranCategories.length > 0) {
                          // Use a global variable to cache Moran's I to avoid heavy re-calculation on every render
                          if (!(window as any)._cachedMoranI || (window as any)._cachedMoranI.config !== JSON.stringify(config.moranCategories) + JSON.stringify(config.weights)) {
                             (window as any)._cachedMoranI = {
                               value: calculateGlobalMoran(gridData, config, config.moranCategories).toFixed(4),
                               config: JSON.stringify(config.moranCategories) + JSON.stringify(config.weights)
                             };
                          }
                          return (window as any)._cachedMoranI.value;
                        }
                        return '请选择因子';
                      })()}
                    </p>
                    <p className="text-[9px] text-amber-500 mt-1 italic">I {'>'} 0 表示集聚, I {'<'} 0 表示离散</p>
                  </div>
                </div>
              ) : renderCategorySelector('lisaCategories', '选择局部自相关因子', 'amber')}
            </div>
          )}
          
          {viewMode === 'entropy' && (
            <div className="space-y-4 mt-4">
              {renderCategorySelector('entropyCategories', '选择混合度计算因子', 'green')}
            </div>
          )}
          {viewMode === 'dbscan' && (
            <div className="space-y-4 mt-4">
              {renderCategorySelector('dbscanCategories', '选择聚类识别因子', 'blue')}
            </div>
          )}

          {viewMode === 'space_syntax' && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, spaceSyntaxSubMode: 'connectivity' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.spaceSyntaxSubMode === 'connectivity' ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  连接度
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, spaceSyntaxSubMode: 'integration' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.spaceSyntaxSubMode === 'integration' ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  集成度
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, spaceSyntaxSubMode: 'choice' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.spaceSyntaxSubMode === 'choice' ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  选择度
                </button>
              </div>
              <p className="text-[9px] text-slate-400 italic">
                {config.spaceSyntaxSubMode === 'connectivity' ? 'Connectivity: 衡量空间单元的直接连接数量' : 
                 config.spaceSyntaxSubMode === 'integration' ? 'Integration: 衡量空间单元在整体系统中的便捷程度' : 
                 'Choice: 衡量空间单元作为最短路径经过的频率'}
              </p>
            </div>
          )}

          {viewMode === 'house_price' && (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">网格化指标 (CSV)</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, housePriceSubMode: 'price' }))}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.housePriceSubMode === 'price' ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    小区均价
                  </button>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, housePriceSubMode: 'area' }))}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.housePriceSubMode === 'area' ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    总建面
                  </button>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, housePriceSubMode: 'plot_ratio' }))}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.housePriceSubMode === 'plot_ratio' ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    容积率
                  </button>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, housePriceSubMode: 'green_ratio' }))}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.housePriceSubMode === 'green_ratio' ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    绿化率
                  </button>
                </div>
              </div>
              <div className="p-3 bg-orange-50 rounded-2xl border border-orange-100">
                <p className="text-[10px] font-bold text-orange-600 uppercase mb-1">数据来源: house_grid_100m_xh.csv</p>
                <p className="text-[9px] text-orange-500 italic">分析房价空间分布及其与城市功能的相关性</p>
              </div>
            </div>
          )}

          {viewMode === 'street_view' && (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">网格化指标 (CSV)</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, streetViewSubMode: 'green_view' }))}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.streetViewSubMode === 'green_view' ? 'bg-cyan-50 border-cyan-200 text-cyan-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    绿视率
                  </button>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, streetViewSubMode: 'sky_view' }))}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.streetViewSubMode === 'sky_view' ? 'bg-cyan-50 border-cyan-200 text-cyan-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    天空开敞
                  </button>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, streetViewSubMode: 'continuity' }))}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.streetViewSubMode === 'continuity' ? 'bg-cyan-50 border-cyan-200 text-cyan-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    界面连续
                  </button>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, streetViewSubMode: 'walkability' }))}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.streetViewSubMode === 'walkability' ? 'bg-cyan-50 border-cyan-200 text-cyan-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    步行适宜
                  </button>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, streetViewSubMode: 'traffic' }))}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.streetViewSubMode === 'traffic' ? 'bg-cyan-50 border-cyan-200 text-cyan-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    交通压力
                  </button>
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, streetViewSubMode: 'activity' }))}
                    className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.streetViewSubMode === 'activity' ? 'bg-cyan-50 border-cyan-200 text-cyan-600' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    街道活力
                  </button>
                </div>
              </div>
              <div className="p-3 bg-cyan-50 rounded-2xl border border-cyan-100">
                <p className="text-[10px] font-bold text-cyan-600 uppercase mb-1">数据来源: Xuhui_streetview_grid_metrics.csv</p>
                <p className="text-[9px] text-cyan-500 italic">基于街景语义分割数据的城市空间品质分析</p>
              </div>
            </div>
          )}

          {viewMode === 'activity_analysis' && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, activitySubMode: 'distribution' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.activitySubMode === 'distribution' ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  活动分布
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, activitySubMode: 'density' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.activitySubMode === 'density' ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  活动密度
                </button>
              </div>
              <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100">
                <p className="text-[10px] font-bold text-rose-600 uppercase mb-1">数据来源: Xuhui_activity_grid.csv</p>
                <p className="text-[9px] text-rose-500 italic">分析城市活动的空间分布规律</p>
              </div>
            </div>
          )}

          {viewMode === 'traffic_analysis' && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, trafficSubMode: 'heat' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.trafficSubMode !== 'network' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  交通热力分析
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, trafficSubMode: 'network' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.trafficSubMode === 'network' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  路网分析
                </button>
              </div>
              <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
                <p className="text-[10px] font-bold text-indigo-600 uppercase mb-1">数据来源: Xuhui_Road_Network_Data_Fixed.csv</p>
                <p className="text-[9px] text-indigo-500 italic">可视化包含：道路功能分类、估计车流量（方向×车道数）{config.trafficSubMode === 'network' ? '，并基于网格邻接绘制路网结构线' : ''}</p>
              </div>
            </div>
          )}

          {viewMode === 'region_selection' && (
            <div className="space-y-4 mt-4">
              <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-4 shadow-sm">
                <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">活动网格特征分析</h4>
                {(() => {
                  const gridData = (window as any).currentGridData;
                  const activityData = (window as any).activityGridData;
                  const housePriceMetrics = (window as any).housePriceGridMetrics;
                  const streetViewMetrics = (window as any).streetViewGridMetrics;
                  
                  if (!gridData || !activityData || gridData.length === 0 || activityData.length === 0) return <p className="text-[9px] text-slate-400 italic">正在加载数据...</p>;
                  
                  const thresholdPercent = config.regionSelectionThreshold ?? 52;
                  const threshold = thresholdPercent / 100;
                  const minRatio = config.regionSelectionMinRatio ?? 0.01;
                  const { idealRanges, values: regionValues } = calculateRegionSelection(gridData, activityData, housePriceMetrics, streetViewMetrics, threshold);
                  const sortedScores = [...regionValues].sort((a, b) => a - b);
                  const minCount = Math.max(1, Math.ceil(regionValues.length * Math.max(0.01, Math.min(0.95, minRatio))));
                  const selectedCount = regionValues.filter(v => v >= threshold).length;
                  const rankIdx = Math.max(0, sortedScores.length - minCount);
                  const ratioThreshold = Number(sortedScores[rankIdx] ?? threshold);
                  const effectiveThreshold = selectedCount >= minCount ? threshold : Math.min(threshold, ratioThreshold);
                  const selectedGridIds = gridData
                    .filter((_, i) => (regionValues[i] || 0) >= effectiveThreshold)
                    .map(g => g.id);
                  
                  if (Object.keys(idealRanges).length === 0) return <p className="text-[9px] text-slate-400 italic">未发现活动网格</p>;
                  
                  return (
                    <div className="space-y-4">
                      <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-slate-500 uppercase">区域选择阈值</span>
                          <span className="text-[9px] font-mono text-indigo-600">{thresholdPercent.toFixed(0)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={thresholdPercent}
                          onChange={(e) => setConfig(prev => ({ ...prev, regionSelectionThreshold: parseFloat(e.target.value) }))}
                          className="w-full h-1 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <p className="text-[8px] text-slate-400">阈值越低，匹配网格越多（更宽松）</p>
                      </div>
                      <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold text-slate-500 uppercase">最少命中比例</span>
                          <span className="text-[9px] font-mono text-indigo-600">{(minRatio * 100).toFixed(0)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.01"
                          max="0.60"
                          step="0.01"
                          value={minRatio}
                          onChange={(e) => setConfig(prev => ({ ...prev, regionSelectionMinRatio: parseFloat(e.target.value) }))}
                          className="w-full h-1 bg-indigo-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <p className="text-[8px] text-slate-400">保证至少选出前 X% 的网格（当阈值过高时自动放宽）</p>
                      </div>
                      <table className="w-full text-[9px] border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-2 font-bold text-slate-400">指标类别</th>
                            <th className="text-center py-2 font-bold text-slate-400">理想区间 (Min-Max)</th>
                            <th className="text-right py-2 font-bold text-slate-400">均值</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(idealRanges).map(([key, range]: [string, any]) => (
                            <tr key={key} className="border-b border-slate-50">
                              <td className="py-2 text-slate-600 font-bold">{(
                                {
                                  poi_density: 'POI 密度',
                                  traffic_poi: '交通设施强度',
                                  traffic_pressure: '交通压力',
                                  green_view: '绿视率',
                                  sky_view: '天空开敞度',
                                  continuity: '界面连续度',
                                  walkability: '步行适宜度',
                                  house_price: '房价水平'
                                } as Record<string, string>
                              )[key] || key}</td>
                              <td className="py-2 text-center text-indigo-600 font-mono">{range.min.toFixed(1)} - {range.max.toFixed(1)}</td>
                              <td className="py-2 text-right text-slate-500">{range.mean.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                        <p className="text-[9px] text-indigo-600 leading-relaxed">
                          <span className="font-bold">分析结论：</span> 基于活动网格的特征提取，已在地图上标记出符合上述“理想区间”的所有潜在高活力网格。
                        </p>
                        <div className="mt-3 flex items-center justify-between">
                          <span className="text-[9px] text-indigo-500">当前选中网格: {selectedGridIds.length} 个</span>
                          <button
                            onClick={() => {
                              const csvRows = [['grid_id'], ...selectedGridIds.map(id => [id])];
                              const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(row => row.join(',')).join('\n');
                              const link = document.createElement('a');
                              link.setAttribute('href', encodeURI(csvContent));
                              link.setAttribute('download', `region-selected-grids-${Date.now()}.csv`);
                              document.body.appendChild(link);
                              link.click();
                              link.remove();
                            }}
                            className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-[9px] font-bold hover:bg-indigo-700 transition-colors"
                          >
                            导出网格编号
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {viewMode === 'factor_importance' && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, factorSubMode: 'importance' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.factorSubMode === 'importance' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  影响因子测度
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, factorSubMode: 'linear' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.factorSubMode === 'linear' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  线性回归
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, factorSubMode: 'lasso' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.factorSubMode === 'lasso' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  Lasso 回归
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, factorSubMode: 'rf' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.factorSubMode === 'rf' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-500'}`}
                >
                  随机森林
                </button>
                <button
                  onClick={() => setConfig(prev => ({ ...prev, factorSubMode: 'gwr' }))}
                  className={`py-2 text-[10px] font-bold rounded-lg border transition-all ${config.factorSubMode === 'gwr' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-500'} col-span-2`}
                >
                  GWR 回归
                </button>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-4 shadow-sm" id="factor-importance-chart">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                    {config.factorSubMode === 'importance' ? 'SHAP Feature Importance' : 
                     config.factorSubMode === 'linear' ? 'OLS Coefficients' : 
                     config.factorSubMode === 'lasso' ? 'Lasso Coefficients' : 
                     config.factorSubMode === 'rf' ? 'RandomForest Importance' : 
                     'GWR Local Coefficients'}
                  </h4>
                </div>
                <div className="space-y-2">
                  {(config.factorSubMode === 'importance' ? [
                    { label: 'SWZZ', value: 0.115, color: 'bg-emerald-900' },
                    { label: 'GSQY_1', value: 0.105, color: 'bg-emerald-800' },
                    { label: 'JRJG_1', value: 0.07, color: 'bg-emerald-700' },
                    { label: 'SHFW', value: 0.055, color: 'bg-emerald-600' },
                    { label: 'SHFW_1', value: 0.053, color: 'bg-emerald-600' },
                    { label: 'diversity', value: 0.05, color: 'bg-emerald-500' },
                    { label: 'QCXG_1', value: 0.048, color: 'bg-emerald-500' },
                    { label: 'YDJS_1', value: 0.04, color: 'bg-emerald-400' },
                    { label: 'GSQY', value: 0.035, color: 'bg-emerald-400' },
                    { label: 'LYJD_1', value: 0.032, color: 'bg-emerald-300' },
                  ] : config.factorSubMode === 'linear' ? [
                    { label: 'JTSS', value: 0.15, color: 'bg-blue-900' },
                    { label: 'CYMS', value: 0.12, color: 'bg-blue-800' },
                    { label: 'GWXF', value: 0.09, color: 'bg-blue-700' },
                    { label: 'SWZZ', value: 0.08, color: 'bg-blue-600' },
                    { label: 'JDZS', value: 0.06, color: 'bg-blue-500' },
                  ] : config.factorSubMode === 'lasso' ? [
                    { label: 'JTSS', value: 0.22, color: 'bg-rose-900' },
                    { label: 'CYMS', value: 0.18, color: 'bg-rose-800' },
                    { label: 'SWZZ', value: 0.12, color: 'bg-rose-700' },
                    { label: 'XXYL', value: 0.05, color: 'bg-rose-600' },
                  ] : config.factorSubMode === 'rf' ? [
                    { label: 'SWZZ', value: 0.18, color: 'bg-emerald-900' },
                    { label: 'JTSS', value: 0.14, color: 'bg-emerald-800' },
                    { label: 'CYMS', value: 0.11, color: 'bg-emerald-700' },
                    { label: 'GWXF', value: 0.09, color: 'bg-emerald-600' },
                  ] : [
                    { label: 'Local_POI', value: 0.25, color: 'bg-amber-900' },
                    { label: 'Local_Price', value: 0.20, color: 'bg-amber-800' },
                    { label: 'Local_Activity', value: 0.15, color: 'bg-amber-700' },
                  ]).map(item => (
                    <div key={item.label} className="flex items-center gap-3">
                      <span className="text-[8px] font-mono text-slate-500 w-12 text-right">{item.label}</span>
                      <div className="flex-1 h-3 bg-slate-50 rounded-sm overflow-hidden border border-slate-100">
                        <div className={`h-full ${item.color}`} style={{ width: `${item.value * 500}%` }} />
                      </div>
                      <span className="text-[8px] font-mono text-slate-400 w-8">{item.value.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[8px] font-mono text-slate-400 pt-2 border-t border-slate-50">
                  <span>0.00</span>
                  <span>0.02</span>
                  <span>0.04</span>
                  <span>0.06</span>
                  <span>0.08</span>
                  <span>0.10</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const chart = document.getElementById('factor-importance-chart');
                    if (chart) {
                      domToCanvas(chart).then(canvas => {
                        const link = document.createElement('a');
                        link.download = `factor-importance-${Date.now()}.png`;
                        link.href = canvas.toDataURL();
                        link.click();
                      });
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-all text-[9px] font-bold"
                >
                  <Download className="w-3 h-3" />
                  导出可视化图
                </button>
                <button
                  onClick={() => {
                    const data = [
                      ['Feature', 'Importance'],
                      ['SWZZ', '0.115'],
                      ['GSQY_1', '0.105'],
                      ['JRJG_1', '0.070'],
                      ['SHFW', '0.055'],
                      ['SHFW_1', '0.053'],
                      ['diversity', '0.050'],
                      ['QCXG_1', '0.048'],
                      ['YDJS_1', '0.040'],
                      ['GSQY', '0.035'],
                      ['LYJD_1', '0.032']
                    ];
                    const csvContent = "data:text/csv;charset=utf-8," + data.map(e => e.join(",")).join("\n");
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement('a');
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", `factor-importance-${Date.now()}.csv`);
                    document.body.appendChild(link);
                    link.click();
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-all text-[9px] font-bold"
                >
                  <Download className="w-3 h-3" />
                  导出数据CSV
                </button>
              </div>

              <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
                <p className="text-[10px] font-bold text-indigo-600 uppercase mb-1">
                  方法说明: {
                    config.factorSubMode === 'importance' ? 'SHAP 特征重要性' :
                    config.factorSubMode === 'linear' ? '多元线性回归 (OLS)' :
                    config.factorSubMode === 'lasso' ? 'Lasso 回归 (特征选择)' :
                    config.factorSubMode === 'rf' ? '随机森林回归 (RF)' :
                    '地理加权回归 (GWR)'
                  }
                </p>
                <p className="text-[9px] text-indigo-500 leading-relaxed">
                  {
                    config.factorSubMode === 'importance' ? '通过博弈论方法评估各空间因子对城市活动强度的边际贡献，揭示复杂的非线性影响。' :
                    config.factorSubMode === 'linear' ? '建立全局线性方程，分析各因子与活动强度之间的平均相关性。' :
                    config.factorSubMode === 'lasso' ? '引入L1正则化，在拟合的同时进行特征筛选，压缩不显著因子的权重。' :
                    config.factorSubMode === 'rf' ? '通过构建多个决策树并对其预测结果进行平均，评估各空间因子的非线性重要性。' :
                    '考虑空间异质性，允许回归系数随地理位置变化，揭示不同区域主导因子的差异。'
                  }
                </p>
              </div>
            </div>
          )}

        </div>

        <p className="mt-4 text-[10px] text-slate-400 leading-relaxed italic">
          {viewMode === 'heat' ? `热力分析 (${config.heatSubMode === 'single' ? '单因子' : config.heatSubMode === 'multi' ? '多因子' : '综合模拟'})` : 
           viewMode === 'kde' ? '核密度分析 (Kernel Density Estimation)' :
           viewMode === 'flow_analysis' ? `人流分析 (${config.flowSubMode === 'custom_formula' ? '流向' : '聚集'})` :
           viewMode === 'spatial_autocorrelation' ? `空间自相关分析 (${config.spatialSubMode === 'moran' ? '全局' : '局部'})` :
           viewMode === 'entropy' ? '功能混合度分析 (Shannon Entropy)' :
           'DBSCAN 空间聚类识别'}
        </p>
        
        {(viewMode === 'kde' || 
          (viewMode === 'heat' && config.heatSubMode === 'multi') || 
          viewMode === 'entropy' || 
          viewMode === 'dbscan' || 
          viewMode === 'spatial_autocorrelation'
        ) && (
          <div className={`mt-4 p-3 rounded-2xl border space-y-3 ${
            viewMode === 'heat' ? 'bg-amber-50 border-amber-100' : 
            viewMode === 'kde' ? 'bg-purple-50 border-purple-100' :
            viewMode === 'entropy' ? 'bg-green-50 border-green-100' :
            viewMode === 'dbscan' ? 'bg-blue-50 border-blue-100' :
            'bg-amber-50 border-amber-100'
          }`}>
            <h3 className={`text-[10px] font-bold uppercase tracking-widest ${
              viewMode === 'heat' ? 'text-amber-600' : 
              viewMode === 'kde' ? 'text-purple-600' :
              viewMode === 'entropy' ? 'text-green-600' :
              viewMode === 'dbscan' ? 'text-blue-600' :
              'text-amber-600'
            }`}>当前视图权重调节</h3>
            <div className="space-y-2">
              {(() => {
                let categories: (keyof POICategories)[] = [];
                if (viewMode === 'heat') {
                  categories = config.multiFactorCategories || [];
                } else if (viewMode === 'kde') {
                  categories = config.kdeCategories || [];
                } else if (viewMode === 'entropy') {
                  categories = config.entropyCategories || [];
                } else if (viewMode === 'dbscan') {
                  categories = config.dbscanCategories || [];
                } else if (viewMode === 'spatial_autocorrelation') {
                  categories = config.spatialSubMode === 'moran' ? config.moranCategories : config.lisaCategories;
                }
                
                return categories.map(key => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-slate-600 flex-1">{POI_LABELS[key]}</span>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="0.1"
                      value={config.weights[key] || 1}
                      onChange={(e) => updateWeight(key, parseFloat(e.target.value))}
                      className={`flex-1 h-1 rounded-lg appearance-none cursor-pointer ${
                        viewMode === 'heat' ? 'bg-amber-200 accent-amber-600' : 
                        viewMode === 'kde' ? 'bg-purple-200 accent-purple-600' :
                        viewMode === 'entropy' ? 'bg-green-200 accent-green-600' :
                        viewMode === 'dbscan' ? 'bg-blue-200 accent-blue-600' :
                        'bg-amber-200 accent-amber-600'
                      }`}
                    />
                    <span className={`font-mono text-[10px] font-bold w-6 text-right shrink-0 ${
                      viewMode === 'heat' ? 'text-amber-600' : 
                      viewMode === 'kde' ? 'text-purple-600' :
                      viewMode === 'entropy' ? 'text-green-600' :
                      viewMode === 'dbscan' ? 'text-blue-600' :
                      'text-amber-600'
                    }`}>
                      {(config.weights[key] || 1).toFixed(1)}
                    </span>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </section>

      {(viewMode === 'heat' && config.heatSubMode === 'simulation') ? (
        <>
          <div className="h-px bg-slate-100" />

          <section className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-2 mb-4 text-slate-900 font-bold text-sm uppercase tracking-wider">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <h2>全局 POI 权重调节</h2>
            </div>
            <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden flex-1 flex flex-col min-h-[400px]">
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead className="sticky top-0 z-10 bg-slate-100 shadow-sm">
                    <tr className="border-b border-slate-200">
                      <th className="p-3 w-1/2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">类别</th>
                      <th className="p-3 w-1/2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">权重调节</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(POI_LABELS).map(([key, label]) => (
                      <tr key={key} className={`transition-all hover:bg-white`}>
                        <td className="p-3 overflow-hidden">
                          <span className={`text-[11px] font-bold truncate block text-slate-600`}>{label}</span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min="0"
                              max="5"
                              step="0.1"
                              value={config.weights[key as keyof typeof config.weights] || 1}
                              onChange={(e) => updateWeight(key, parseFloat(e.target.value))}
                              className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <span className="font-mono text-[11px] font-bold text-indigo-600 w-8 text-right shrink-0">
                              {(config.weights[key as keyof typeof config.weights] || 1).toFixed(1)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {viewMode === 'flow_analysis' && (
        <>
          <div className="h-px bg-slate-100" />

          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm uppercase tracking-wider">
                <Zap className="w-4 h-4 text-amber-500" />
                <h2>特殊事件模拟</h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfig(prev => ({ ...prev, isSimulationActive: !prev.isSimulationActive }))}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5 ${config.isSimulationActive ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  <Play className={`w-3 h-3 ${config.isSimulationActive ? 'fill-current' : ''}`} />
                  {config.isSimulationActive ? '停止模拟' : '开始模拟'}
                </button>
                {config.isSimulationActive && (
                  <div className="flex-1 flex items-center gap-2 px-3 bg-amber-50 rounded-lg border border-amber-100">
                    <div className="flex-1 h-1 bg-amber-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 transition-all duration-500" 
                        style={{ width: `${config.simulationStep * 10}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-bold text-amber-600 w-8">{config.simulationStep * 10}%</span>
                  </div>
                )}
                <button
                  onClick={() => setConfig(prev => ({ ...prev, events: [], isSimulationActive: false }))}
                  className="p-1.5 bg-slate-100 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all shadow-md active:scale-95"
                  title="清空所有事件"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                {!draftEvent && !config.isSimulationActive && (
                  <button
                    onClick={startAddEvent}
                    className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              {/* Draft Event UI */}
              {draftEvent && (
                <div className="p-4 bg-indigo-50 rounded-2xl border-2 border-indigo-200 space-y-4 shadow-md animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">新建事件参数</span>
                    <button
                      onClick={() => setDraftEvent(null)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    <div className="col-span-2 space-y-1">
                      <label className="text-indigo-400">事件名称</label>
                      <input
                        value={draftEvent.name}
                        onChange={(e) => setDraftEvent({ ...draftEvent, name: e.target.value })}
                        className="w-full p-2 bg-white border border-indigo-100 rounded-lg text-slate-700 outline-none text-xs"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-indigo-400">所属因子类别</label>
                      <select
                        value={draftEvent.category}
                        onChange={(e) => setDraftEvent({ ...draftEvent, category: e.target.value as keyof POICategories })}
                        className="w-full p-2 bg-white border border-indigo-100 rounded-lg text-slate-700 outline-none text-xs"
                      >
                        {Object.entries(POI_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-indigo-400">作用范围</label>
                      <select
                        value={draftEvent.scope || 'grid'}
                        onChange={(e) => setDraftEvent({ ...draftEvent, scope: e.target.value as 'grid' | 'global' | 'region' })}
                        className="w-full p-1.5 bg-white border border-indigo-100 rounded-lg text-slate-700 outline-none text-xs"
                      >
                        <option value="grid">单网格</option>
                        <option value="global">全局所有网格</option>
                        <option value="region">中心网格 + 周边范围</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-indigo-400">影响方式</label>
                      <select
                        value={draftEvent.effect || 'percent'}
                        onChange={(e) => setDraftEvent({ ...draftEvent, effect: e.target.value as 'add' | 'percent' })}
                        className="w-full p-1.5 bg-white border border-indigo-100 rounded-lg text-slate-700 outline-none text-xs"
                      >
                        <option value="percent">百分比变化</option>
                        <option value="add">增量叠加</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-indigo-400">网格ID (数字)</label>
                      <input
                        type="text"
                        value={draftEvent.gridId || ''}
                        onChange={(e) => setDraftEvent({ ...draftEvent, gridId: e.target.value.replace(/\D/g, '') })}
                        placeholder="例如: 123"
                        disabled={draftEvent.scope === 'global'}
                        className="w-full p-1.5 bg-white border border-indigo-100 rounded-lg text-slate-700 outline-none text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-indigo-400">{draftEvent.effect === 'percent' ? '变化百分比(%)' : '强度系数'}</label>
                      <input
                        type="number"
                        value={draftEvent.intensity}
                        onChange={(e) => setDraftEvent({ ...draftEvent, intensity: parseFloat(e.target.value) })}
                        className="w-full p-1.5 bg-white border border-indigo-100 rounded-lg text-slate-700 outline-none"
                      />
                    </div>
                    {draftEvent.scope === 'region' ? (
                      <div className="space-y-1">
                        <label className="text-indigo-400">范围（几圈网格）</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={draftEvent.gridRange || 1}
                          onChange={(e) => setDraftEvent({ ...draftEvent, gridRange: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                          className="w-full p-1.5 bg-white border border-indigo-100 rounded-lg text-slate-700 outline-none"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label className="text-indigo-400">半径 (m)</label>
                        <input
                          type="number"
                          value={draftEvent.radius}
                          onChange={(e) => setDraftEvent({ ...draftEvent, radius: parseFloat(e.target.value) })}
                          disabled={draftEvent.scope === 'global' || draftEvent.scope === 'grid'}
                          className="w-full p-1.5 bg-white border border-indigo-100 rounded-lg text-slate-700 outline-none"
                        />
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={confirmAddEvent}
                    disabled={!canConfirmDraftEvent}
                    className={`w-full py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 ${canConfirmDraftEvent ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                  >
                    确认添加事件
                  </button>
                </div>
              )}

              {config.events.map(event => (
                <div key={event.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 shadow-sm">
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <input
                        value={event.name}
                        onChange={(e) => updateEvent(event.id, { name: e.target.value })}
                        className="bg-transparent font-bold text-slate-800 focus:outline-none w-32 text-xs"
                      />
                      <select
                        value={event.category || 'CYMS'}
                        onChange={(e) => updateEvent(event.id, { category: e.target.value as keyof POICategories })}
                        className="bg-transparent text-[8px] text-indigo-500 font-bold uppercase focus:outline-none cursor-pointer"
                      >
                        {Object.entries(POI_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => removeEvent(event.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                    <div className="space-y-1">
                      <label>作用范围</label>
                      <select
                        value={event.scope || 'grid'}
                        onChange={(e) => {
                          const scope = e.target.value as 'grid' | 'global' | 'region';
                          const gridData = (window as any).currentGridData as GridData[];
                          const spacing = estimateGridSpacingMeters(gridData || []);
                          if (scope === 'global') {
                            const center = getGridCenter(gridData || []);
                            updateEvent(event.id, { scope, gridId: '', x: center.x, y: center.y, radius: 0, gridRange: 1 });
                          } else if (scope === 'region') {
                            updateEvent(event.id, { scope, gridRange: event.gridRange || 1, radius: (event.gridRange || 1) * spacing });
                          } else {
                            updateEvent(event.id, { scope, radius: Math.max(80, spacing) });
                          }
                        }}
                        className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 outline-none text-xs"
                      >
                        <option value="grid">单网格</option>
                        <option value="global">全局所有网格</option>
                        <option value="region">中心网格 + 周边范围</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label>影响方式</label>
                      <select
                        value={event.effect || 'percent'}
                        onChange={(e) => updateEvent(event.id, { effect: e.target.value as 'add' | 'percent' })}
                        className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 outline-none text-xs"
                      >
                        <option value="percent">百分比变化</option>
                        <option value="add">增量叠加</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label>网格ID</label>
                      <input
                        type="text"
                        value={event.gridId || ''}
                        onChange={(e) => {
                          const num = e.target.value.replace(/\D/g, '');
                          const fullId = num;
                          const gridData = (window as any).currentGridData as GridData[];
                          const targetGrid = gridData?.find(g => g.id === fullId);
                          if (targetGrid) {
                            updateEvent(event.id, { gridId: fullId, x: targetGrid.x, y: targetGrid.y });
                          } else {
                            updateEvent(event.id, { gridId: fullId });
                          }
                        }}
                        disabled={event.scope === 'global'}
                        className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 outline-none text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label>{event.effect === 'percent' ? '变化百分比(%)' : '强度系数'}</label>
                      <input
                        type="number"
                        value={event.intensity}
                        onChange={(e) => updateEvent(event.id, { intensity: parseFloat(e.target.value) })}
                        className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
                      />
                    </div>
                    {event.scope === 'region' ? (
                      <div className="space-y-1">
                        <label>范围（几圈网格）</label>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={event.gridRange || 1}
                          onChange={(e) => {
                            const range = Math.max(1, parseInt(e.target.value || '1', 10));
                            const gridData = (window as any).currentGridData as GridData[];
                            const spacing = estimateGridSpacingMeters(gridData || []);
                            updateEvent(event.id, { gridRange: range, radius: range * spacing });
                          }}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <label>半径 (m)</label>
                        <input
                          type="number"
                          value={event.radius}
                          onChange={(e) => updateEvent(event.id, { radius: parseFloat(e.target.value) })}
                          disabled={event.scope !== 'region'}
                          className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 outline-none"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {config.events.length > 0 && (
                <button
                  onClick={() => {
                    // Trigger re-calculation by updating a dummy state or just forcing re-render
                    setConfig(prev => ({ ...prev }));
                  }}
                  className="w-full py-3 bg-amber-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-amber-600 transition-all shadow-lg shadow-amber-200 flex items-center justify-center gap-2"
                >
                  <Zap className="w-3 h-3" />
                  模拟事件影响
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
