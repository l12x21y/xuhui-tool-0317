export type ScopeArea = 'xuhui' | 'greater_xujiahui';

export type VisualizationMode =
  | 'location'
  | 'traffic'
  | 'heat'
  | 'kde'
  | 'house_price'
  | 'street_view'
  | 'activity';

export type AnalysisMode =
  | 'spatial_autocorrelation'
  | 'mix_degree'
  | 'cluster_identification'
  | 'space_syntax';

export type FactorMode = 'grid_score' | 'factor_correlation';

export type PredictionMode = 'flow_prediction';

export type MainMode = VisualizationMode | AnalysisMode | FactorMode | PredictionMode;

export type HeatMode = 'single' | 'multi' | 'overall';

export type FactorBusinessCategory =
  | 'ACGN'
  | 'Auto'
  | 'F&B'
  | 'Public'
  | 'Star'
  | 'Lifestyle'
  | 'Beauty'
  | 'Culture&Art'
  | 'Overall';

export type ViewMode = MainMode | HeatMode | keyof POICategories;

export interface POICategories {
  CYMS: number; // 餐饮美食
  GSQY: number; // 公司企业
  GWXF: number; // 购物消费
  JTSS: number; // 交通设施
  JRJG: number; // 金融机构
  JDZS: number; // 酒店住宿
  KJWH: number; // 科教文化
  LYJD: number; // 旅游景点
  QCXG: number; // 汽车相关
  SWZZ: number; // 商务住宅
  SHFW: number; // 生活服务
  XXYL: number; // 休闲娱乐
  YLBJ: number; // 医疗保健
  YDJS: number; // 运动健身
}

export interface GridData {
  id: string;
  x: number;
  y: number;
  pois: POICategories;
  baseHeat: number;
  feature?: any; // Original GeoJSON feature
}

export interface SimulationConfig {
  weights: Record<keyof POICategories, number>;
  events: EventData[];
  multiFactorCategories: (keyof POICategories)[];
  singleFactorCategory?: keyof POICategories;
  heatMode: HeatMode;
  analysisCategory: keyof POICategories;
  factorBusinessCategory: FactorBusinessCategory;
  flowBusinessCategory: FactorBusinessCategory;
  flowSelectedGridIds: string[];
  flowRadiusMeters: number;
  flowSelectedFactor: string;
  flowDelta: number;
  flowCurrentMonth: number;
  flowCurrentWeekday: number;
  flowDraftMonths: number[];
  flowDraftWeekdays: number[];
  flowTimeBoost: number;
  flowChanges: FlowChange[];
  isSimulationActive: boolean;
  simulationStep: number;
  flowDurationDays: number;
}

export const POI_LABELS: Record<string, string> = {
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

export interface EventData {
  id: string;
  name: string;
  gridId: string;
  category: keyof POICategories;
  intensity: number;
}

export interface GridMetricRow {
  [key: string]: string | number | undefined;
}

export interface FlowChange {
  id: string;
  businessCategory: FactorBusinessCategory;
  factor: string;
  gridIds: string[];
  radiusMeters: number;
  delta: number;
  activeMonths: number[];
  activeWeekdays: number[];
  timeBoost: number;
}

export interface TemporalCategoryWeights {
  totalEvents: number;
  avgDurationDays: number;
  categoryWeight: number;
  categoryMultiplier: number;
  monthWeights: Record<string, number>;
  weekdayWeights: Record<string, number>;
  monthMultipliers: Record<string, number>;
  weekdayMultipliers: Record<string, number>;
}

export interface TemporalWeightsPayload {
  formula: Record<string, string>;
  meta: {
    source: string;
    sheets: string[];
    categories: string[];
    allTotalEvents: number;
  };
  weightsByCategory: Record<Exclude<FactorBusinessCategory, 'Overall'>, TemporalCategoryWeights>;
}

export type ImportanceWeightsByCategory = Record<FactorBusinessCategory, Record<string, number>>;

export type AttractionBaselineByCategory = Record<FactorBusinessCategory, Record<string, number>>;
