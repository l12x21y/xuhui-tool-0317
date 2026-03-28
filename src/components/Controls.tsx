import { CalendarClock, Download, Layers, MapPin, SlidersHorizontal, Sparkles, Timer } from 'lucide-react';
import {
  MainMode,
  POI_LABELS,
  POICategories,
  SimulationConfig,
  FactorBusinessCategory,
  ImportanceWeightsByCategory,
  TemporalWeightsPayload,
} from '../types';

interface ControlsProps {
  viewMode: MainMode;
  setViewMode: (mode: MainMode) => void;
  config: SimulationConfig;
  setConfig: (updater: (prev: SimulationConfig) => SimulationConfig) => void;
  onExportPng: () => void;
  isExporting: boolean;
  importanceByCategory: ImportanceWeightsByCategory;
  temporalWeights: TemporalWeightsPayload | null;
}

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

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, idx) => {
  const value = idx + 1;
  return { value, label: `${value}月` };
});

const WEEKDAY_OPTIONS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
];

const SECTION_1: Array<{ key: MainMode; label: string }> = [
  { key: 'location', label: '区位分析' },
  { key: 'traffic', label: '交通分析' },
  { key: 'heat', label: '热力分析' },
  { key: 'kde', label: '核密度分析' },
  { key: 'house_price', label: '房价分析' },
  { key: 'street_view', label: '街景分析' },
  { key: 'activity', label: '活动分析' },
];

const SECTION_2: Array<{ key: MainMode; label: string }> = [
  { key: 'spatial_autocorrelation', label: '空间自相关' },
  { key: 'mix_degree', label: '混合度分析' },
  { key: 'cluster_identification', label: '聚类识别' },
  { key: 'space_syntax', label: '空间句法' },
];

const SECTION_3: Array<{ key: MainMode; label: string }> = [
  { key: 'grid_score', label: '网格打分' },
  { key: 'factor_correlation', label: '因子关联分析' },
];

const SECTION_4: Array<{ key: MainMode; label: string }> = [
  { key: 'flow_prediction', label: '人流预测模拟' },
];

const SectionButtons = ({
  title,
  buttons,
  viewMode,
  setViewMode,
}: {
  title: string;
  buttons: Array<{ key: MainMode; label: string }>;
  viewMode: MainMode;
  setViewMode: (mode: MainMode) => void;
}) => (
  <div className="space-y-2">
    <h3 className="text-[10px] font-bold text-slate-400 tracking-[0.18em] uppercase">{title}</h3>
    <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-100 rounded-xl">
      {buttons.map((button) => (
        <button
          key={button.key}
          type="button"
          onClick={() => setViewMode(button.key)}
          className={`py-2 text-[11px] font-bold rounded-lg transition-all duration-200 active:scale-[0.98] ${
            viewMode === button.key
              ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-indigo-200'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/70'
          }`}
        >
          {button.label}
        </button>
      ))}
    </div>
  </div>
);

export const Controls = ({
  viewMode,
  setViewMode,
  config,
  setConfig,
  onExportPng,
  isExporting,
  importanceByCategory,
  temporalWeights,
}: ControlsProps) => {
  const topFactors = Object.entries(importanceByCategory[config.factorBusinessCategory] || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 10);

  const maxFactorWeight = topFactors.length > 0
    ? Math.max(...topFactors.map(([, weight]) => Number(weight) || 0), 1)
    : 1;

  const flowTopFactors = Object.entries(importanceByCategory[config.flowBusinessCategory] || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 10);

  const flowSelectedGridPreview = config.flowSelectedGridIds.slice(0, 6);

  return (
    <aside className="w-[360px] h-full overflow-y-auto border-r border-slate-200 bg-white p-4 space-y-5 shadow-xl shadow-slate-200/60">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-bold">分析控制台</span>
          </div>
          <button
            type="button"
            onClick={onExportPng}
            disabled={isExporting}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-200 hover:shadow-sm active:scale-[0.98] disabled:opacity-60"
          >
            <Download className="w-3 h-3" />
            {isExporting ? '导出中...' : '导出PNG'}
          </button>
        </div>
      </section>

      <SectionButtons title="板块一：数据可视化（徐汇）" buttons={SECTION_1} viewMode={viewMode} setViewMode={setViewMode} />
      <SectionButtons title="板块二：数据分析（徐汇）" buttons={SECTION_2} viewMode={viewMode} setViewMode={setViewMode} />
      <SectionButtons title="板块三：因子分析（大徐家汇）" buttons={SECTION_3} viewMode={viewMode} setViewMode={setViewMode} />
      <SectionButtons title="板块四：模拟预测（大徐家汇）" buttons={SECTION_4} viewMode={viewMode} setViewMode={setViewMode} />

      {(viewMode === 'heat' || viewMode === 'kde') && (
        <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-3 shadow-sm">
          <h4 className="text-xs font-bold text-slate-700">热力参数</h4>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/80 p-1.5 border border-indigo-100">
            {[
              { key: 'single', label: '单因子' },
              { key: 'multi', label: '多因子' },
              { key: 'overall', label: '整体' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setConfig((prev) => ({ ...prev, heatMode: item.key as SimulationConfig['heatMode'] }))}
                className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-all ${
                  config.heatMode === item.key
                    ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:shadow-sm'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {config.heatMode === 'single' && (
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-white/80 p-2 border border-indigo-100 max-h-44 overflow-y-auto">
              {Object.entries(POI_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, singleFactorCategory: key as keyof POICategories }))}
                  className={`rounded-md px-2 py-1 text-xs text-left transition-all ${
                    (config.singleFactorCategory || 'CYMS') === key
                        ? 'bg-indigo-600 text-white ring-1 ring-indigo-300'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:shadow-sm'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {config.heatMode === 'multi' && (
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-white/80 p-2 border border-indigo-100 max-h-44 overflow-y-auto">
              {Object.entries(POI_LABELS).map(([key, label]) => {
                const checked = config.multiFactorCategories.includes(key as keyof POICategories);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setConfig((prev) => {
                        const current = prev.multiFactorCategories;
                        const next = checked
                          ? current.filter((item) => item !== key)
                          : [...current, key as keyof POICategories];
                        return { ...prev, multiFactorCategories: next.slice(0, 14) };
                      });
                    }}
                    className={`rounded-md px-2 py-1 text-xs text-left transition-all ${
                      checked
                        ? 'bg-indigo-600 text-white ring-1 ring-indigo-300'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:shadow-sm'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {(viewMode === 'spatial_autocorrelation' || viewMode === 'mix_degree' || viewMode === 'cluster_identification') && (
        <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-3 space-y-2">
          <h4 className="text-xs font-bold text-slate-700">分析类别</h4>
          <select
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
            value={config.analysisCategory}
            onChange={(e: any) => setConfig((prev) => ({ ...prev, analysisCategory: e.target.value as keyof POICategories }))}
          >
            {Object.entries(POI_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </section>
      )}

      {viewMode === 'grid_score' && (
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 space-y-2">
          <h4 className="text-xs font-bold text-slate-700">网格打分业态（9类）</h4>
          <select
            className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700"
            value={config.factorBusinessCategory}
            onChange={(e: any) => setConfig((prev) => ({ ...prev, factorBusinessCategory: e.target.value as FactorBusinessCategory }))}
          >
            {FACTOR_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <div className="rounded-xl border border-emerald-100 bg-white/90 p-2.5 space-y-2">
            <p className="text-[11px] font-semibold text-slate-700">当前业态 Top10 影响因子</p>
            {topFactors.length === 0 ? (
              <p className="text-[11px] text-slate-400">暂无权重数据</p>
            ) : (
              <div className="space-y-1.5">
                {topFactors.map(([feature, weight]) => {
                  const ratio = Math.max(0.04, (Number(weight) || 0) / maxFactorWeight);
                  return (
                    <div key={feature} className="space-y-1">
                      <div className="text-[11px] text-slate-600 truncate" title={feature}>{feature}</div>
                      <div className="h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.min(100, Math.max(4, ratio * 100))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {viewMode === 'flow_prediction' && (
        <section className="rounded-2xl border border-cyan-100 bg-gradient-to-b from-cyan-50 to-white p-3 space-y-3 shadow-sm">
          <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5 text-cyan-600" />
            人流预测模拟
          </h4>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
              1) 当前模拟业态
            </label>
            <select
              className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
              value={config.flowBusinessCategory}
              onChange={(e: any) => {
                const business = e.target.value as FactorBusinessCategory;
                const nextTop = Object.entries(importanceByCategory[business] || {})
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .slice(0, 10);
                setConfig((prev) => ({
                  ...prev,
                  flowBusinessCategory: business,
                  flowSelectedFactor: nextTop[0]?.[0] || prev.flowSelectedFactor,
                }));
              }}
            >
              {FACTOR_CATEGORIES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>

          <div className="rounded-md border border-slate-200 p-2 space-y-2">
            <label className="block text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-cyan-600" />
              2) 选择网格（地图可多选）与辐射范围
            </label>
            <p className="text-[11px] text-slate-500">已选网格：{config.flowSelectedGridIds.length}</p>
            {flowSelectedGridPreview.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {flowSelectedGridPreview.map((id) => (
                  <span key={id} className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px]">{id}</span>
                ))}
                {config.flowSelectedGridIds.length > flowSelectedGridPreview.length && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px]">+{config.flowSelectedGridIds.length - flowSelectedGridPreview.length}</span>
                )}
              </div>
            )}
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">辐射范围（米）：{Math.round(config.flowRadiusMeters)}</label>
              <input
                type="range"
                min={100}
                max={2000}
                step={50}
                value={config.flowRadiusMeters}
                onChange={(e: any) => setConfig((prev) => ({ ...prev, flowRadiusMeters: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-2 space-y-2">
            <label className="block text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-600" />
              3) 选择改变属性（当前业态前10影响因子）
            </label>
            {flowTopFactors.length === 0 ? (
              <p className="text-[11px] text-slate-400">暂无影响因子</p>
            ) : (
              <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto">
                {flowTopFactors.map(([factor]) => {
                  const active = config.flowSelectedFactor === factor;
                  return (
                    <button
                      key={factor}
                      type="button"
                      onClick={() => setConfig((prev) => ({ ...prev, flowSelectedFactor: factor }))}
                      className={`rounded-md px-2 py-1 text-[11px] text-left transition-all duration-200 active:scale-[0.98] ${active ? 'bg-cyan-600 text-white ring-1 ring-cyan-300 shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:shadow-sm'}`}
                    >
                      {factor}
                    </button>
                  );
                })}
              </div>
            )}

            <div>
              <label className="block text-[11px] text-slate-500 mb-1">吸引力变化强度：{config.flowDelta}</label>
              <input
                type="range"
                min={-100}
                max={100}
                step={5}
                value={config.flowDelta}
                onChange={(e: any) => setConfig((prev) => ({ ...prev, flowDelta: Number(e.target.value) }))}
                className="w-full"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfig((prev) => ({
                  ...prev,
                  flowSelectedGridIds: [],
                }))}
                className="rounded-md bg-slate-200 px-3 py-1 text-xs text-slate-700 transition-all duration-200 hover:bg-slate-300 hover:shadow-sm active:scale-[0.98]"
              >
                清空当前设置
              </button>
              <button
                type="button"
                disabled={config.flowSelectedGridIds.length === 0 || !config.flowSelectedFactor}
                onClick={() => {
                  setConfig((prev) => {
                    if (prev.flowSelectedGridIds.length === 0 || !prev.flowSelectedFactor) return prev;
                    const nextChange = {
                      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                      businessCategory: prev.flowBusinessCategory,
                      factor: prev.flowSelectedFactor,
                      gridIds: [...prev.flowSelectedGridIds],
                      radiusMeters: prev.flowRadiusMeters,
                      delta: prev.flowDelta,
                      activeMonths: [],
                      activeWeekdays: [],
                      timeBoost: 1,
                    };
                    return {
                      ...prev,
                      flowChanges: [...prev.flowChanges, nextChange],
                      flowSelectedGridIds: [],
                    };
                  });
                }}
                className="rounded-md bg-cyan-600 px-3 py-1 text-xs text-white transition-all duration-200 hover:bg-cyan-700 hover:shadow-sm active:scale-[0.98] disabled:bg-slate-300"
              >
                添加本次改变
              </button>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-2 space-y-1">
            <label className="block text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-600" />
              4) 已添加改变（可重复添加）
            </label>
            {config.flowChanges.length === 0 ? (
              <p className="text-[11px] text-slate-400">暂无改变项</p>
            ) : (
              config.flowChanges.map((change) => (
                <div key={change.id} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 border border-slate-100">
                  <span className="text-[11px] text-slate-600 truncate">
                    {change.businessCategory} · {change.factor} · {change.gridIds.length}格 · {Math.round(change.radiusMeters)}m
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, flowChanges: prev.flowChanges.filter((item) => item.id !== change.id) }))}
                    className="text-[11px] px-2 py-0.5 rounded bg-rose-50 text-rose-600 transition-all duration-200 hover:bg-rose-100 active:scale-[0.98]"
                  >
                    删除
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfig((prev) => {
                const maxDays = Math.max(1, Math.min(90, Math.round(prev.flowDurationDays || 1)));
                if (!prev.isSimulationActive) {
                  return {
                    ...prev,
                    isSimulationActive: true,
                    simulationStep: prev.simulationStep >= maxDays ? 0 : prev.simulationStep,
                  };
                }
                return { ...prev, isSimulationActive: false };
              })}
              className="rounded-md bg-emerald-600 px-3 py-1 text-xs text-white shadow-sm transition-all duration-200 hover:bg-emerald-700 hover:shadow-md active:scale-[0.98]"
            >
              {config.isSimulationActive ? '暂停模拟' : '开始模拟'}
            </button>
            <button
              type="button"
              onClick={() => setConfig((prev) => ({ ...prev, flowChanges: [], flowSelectedGridIds: [] }))}
              className="rounded-md bg-slate-200 px-3 py-1 text-xs text-slate-700 transition-all duration-200 hover:bg-slate-300 hover:shadow-sm active:scale-[0.98]"
            >
              清空全部改变
            </button>
          </div>

          <div className="rounded-md border border-slate-200 p-2 space-y-2">
            <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-cyan-600" />
              5) 活动开始时间
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">开始月份</label>
                <select
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                  value={config.flowCurrentMonth}
                  onChange={(e: any) => setConfig((prev) => ({ ...prev, flowCurrentMonth: Number(e.target.value) }))}
                >
                  {MONTH_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">开始星期</label>
                <select
                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs"
                  value={config.flowCurrentWeekday}
                  onChange={(e: any) => setConfig((prev) => ({ ...prev, flowCurrentWeekday: Number(e.target.value) }))}
                >
                  {WEEKDAY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">时间步进会从这里设定的月份与星期起算，并套用时间分析权重。</p>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-cyan-600" />
              6) 活动举办天数：{config.flowDurationDays} 天
            </label>
            <input
              type="range"
              min={1}
              max={90}
              step={1}
              value={config.flowDurationDays}
              onChange={(e: any) => setConfig((prev) => {
                const nextDays = Math.max(1, Math.min(90, Number(e.target.value) || 1));
                return {
                  ...prev,
                  flowDurationDays: nextDays,
                  simulationStep: Math.min(prev.simulationStep, nextDays),
                };
              })}
              className="w-full"
            />
            <p className="text-[11px] text-slate-500 mt-1">模拟步长会按天推进，达到活动天数后自动停止。</p>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-cyan-600" />
              7) 当前模拟日：第 {config.simulationStep} 天 / 共 {config.flowDurationDays} 天
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(1, config.flowDurationDays)}
              step={1}
              value={config.simulationStep}
              onChange={(e: any) => setConfig((prev) => ({ ...prev, simulationStep: Number(e.target.value) }))}
              className="w-full"
            />
            <p className="text-[11px] text-slate-500 mt-1">已接入{temporalWeights?.meta?.source || '时间分析.xlsx'}的业态/月/星期权重，随模拟日自动映射到对应时间影响。</p>
          </div>
        </section>
      )}
    </aside>
  );
};
