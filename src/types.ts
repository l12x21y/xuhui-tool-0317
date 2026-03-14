export type MainMode = 
  | 'location_analysis' | 'traffic_analysis' | 'heat' | 'kde' | 'house_price' | 'street_view' | 'activity_analysis' 
  | 'spatial_autocorrelation' | 'entropy' | 'dbscan' | 'space_syntax' | 'factor_importance'
  | 'flow_analysis' | 'region_selection';

export type LocationAreaMode = 'xuhui' | 'greater_xujiahui';

export type HeatSubMode = 'single' | 'multi' | 'simulation';
export type FlowSubMode = 'custom_formula' | 'ml_driven';
export type SpatialSubMode = 'moran' | 'lisa';
export type SpaceSyntaxSubMode = 'connectivity' | 'integration' | 'choice';
export type HousePriceSubMode = 'price' | 'area' | 'plot_ratio' | 'green_ratio';
export type StreetViewSubMode = 'green_view' | 'sky_view' | 'continuity' | 'walkability' | 'traffic' | 'activity';
export type ActivitySubMode = 'distribution' | 'density';
export type FactorSubMode = 'importance' | 'linear' | 'rf' | 'gwr';
export type TrafficSubMode = 'heat' | 'network';

export type ViewMode = MainMode | HeatSubMode | FlowSubMode | SpatialSubMode | SpaceSyntaxSubMode | HousePriceSubMode | StreetViewSubMode | ActivitySubMode | FactorSubMode | TrafficSubMode | keyof POICategories;

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
  customFormula: {
    traffic: number;
    commercial: number;
    purchasing: number;
    youth: number;
  };
  events: EventData[];
  multiFactorCategories?: (keyof POICategories)[];
  kdeCategories?: (keyof POICategories)[];
  flowCategories?: (keyof POICategories)[];
  aggregationCategories?: (keyof POICategories)[];
  moranCategories?: (keyof POICategories)[];
  lisaCategories?: (keyof POICategories)[];
  entropyCategories?: (keyof POICategories)[];
  dbscanCategories?: (keyof POICategories)[];
  singleFactorCategory?: keyof POICategories;
  heatSubMode: HeatSubMode;
  flowSubMode: FlowSubMode;
  spatialSubMode: SpatialSubMode;
  spaceSyntaxSubMode: SpaceSyntaxSubMode;
  housePriceSubMode: HousePriceSubMode;
  streetViewSubMode: StreetViewSubMode;
  activitySubMode: ActivitySubMode;
  factorSubMode: FactorSubMode;
  trafficSubMode?: TrafficSubMode;
  isSimulationActive: boolean;
  simulationStep: number;
  regionSelectionThreshold?: number;
  regionSelectionMinRatio?: number;
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
  x: number;
  y: number;
  radius: number;
  intensity: number;
  gridId?: string;
  category?: keyof POICategories;
  scope?: 'grid' | 'global' | 'region';
  effect?: 'add' | 'percent';
  gridRange?: number;
}

export interface RoadNetworkRecord {
  startNodeId: string;
  endNodeId: string;
  roadName: string;
  functionalClass: string;
  direction: string;
  lanes: string;
  length: number;
  speed: number;
  osmTag: string;
  flowScore: number;
}

export interface RoadFeatureCollection {
  type: 'FeatureCollection';
  features: any[];
}
