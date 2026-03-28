import os
import math
import argparse
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import r2_score

# 配置
sns.set(style="whitegrid")
plt.rcParams['font.sans-serif'] = ['SimHei']
plt.rcParams['axes.unicode_minus'] = False


def read_csv_with_encodings(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f'文件不存在: {path}')
    encs = ('utf-8-sig', 'utf-8', 'gbk', 'latin1')
    last_err = None
    for enc in encs:
        try:
            return pd.read_csv(path, encoding=enc)
        except Exception as e:
            last_err = e
            continue
    raise last_err


parser = argparse.ArgumentParser(description='Run Random Forest per-activity (按业态随机森林)')
parser.add_argument('--grid', default='grid_100m_all.csv', help='网格 CSV 文件路径，默认 grid_100m_all.csv')
parser.add_argument('--activity', default=None, help='活动点表（Excel/CSV），若为空则尝试 repository 的 Xuhui_activity_grid.csv')
parser.add_argument('--shp', default=os.path.join('merge_shp', 'merged_area84.shp'), help='网格矢量 shapefile，默认 merge_shp/merged_area84.shp')
parser.add_argument('--outdir', default='rf_outputs_by_activity', help='输出目录')
args = parser.parse_args()

base_grid_csv = args.grid
activity_file = args.activity or 'Xuhui_activity_grid.csv'
grid_shp_file = args.shp
save_dir = args.outdir
os.makedirs(save_dir, exist_ok=True)

print('读取网格数据...')
# 尝试用多种编码读取
try:
    grid_df = read_csv_with_encodings(base_grid_csv)
except Exception as e:
    raise

grid_df = grid_df.copy()
# 若没有 grid_id，则按索引创建
if 'grid_id' not in grid_df.columns:
    grid_df['grid_id'] = grid_df.index

print('读取网格矢量...')
if not os.path.exists(grid_shp_file):
    print('警告：矢量 shapefile 不存在，后续空间叠加会跳过：', grid_shp_file)
    grid_gdf = None
else:
    grid_gdf = gpd.read_file(grid_shp_file).reset_index(drop=True)
    if 'grid_id' not in grid_gdf.columns:
        grid_gdf['grid_id'] = grid_gdf.index

# 将表格属性合并到矢量上（若矢量存在）
if grid_gdf is not None:
    for col in grid_df.columns:
        if col not in ['grid_id', 'geometry']:
            try:
                grid_gdf[col] = grid_gdf['grid_id'].map(grid_df.set_index('grid_id')[col])
            except Exception:
                grid_gdf[col] = grid_df.get(col)

print('读取活动数据并映射到网格...')
# 读取活动文件，支持 Excel 或 CSV
if activity_file.lower().endswith('.xlsx') or activity_file.lower().endswith('.xls'):
    activity_df = pd.read_excel(activity_file)
else:
    # CSV 用通用编码读取
    if os.path.exists(activity_file):
        try:
            activity_df = read_csv_with_encodings(activity_file)
        except Exception:
            activity_df = pd.read_csv(activity_file, encoding='utf-8', errors='ignore')
    else:
        print('未找到活动表，创建空表格占位（会导致所有网格 activity_count=0）')
        activity_df = pd.DataFrame()

# 识别经纬度列
lon_col = None
lat_col = None
for c in ['经度', 'longitude', 'lon', 'LONGITUDE', 'LON', 'lon_x', 'lon_y']:
    if c in activity_df.columns:
        lon_col = c
        break
for c in ['纬度', 'latitude', 'lat', 'LATITUDE', 'LAT', 'lat_x', 'lat_y']:
    if c in activity_df.columns:
        lat_col = c
        break

if activity_df.shape[0] > 0 and (lon_col is None or lat_col is None):
    raise ValueError('无法识别活动数据中的经度/纬度列')

if activity_df.shape[0] > 0:
    activity_df['lon'] = pd.to_numeric(activity_df[lon_col], errors='coerce')
    activity_df['lat'] = pd.to_numeric(activity_df[lat_col], errors='coerce')

# allowed_vars 与原脚本一致
allowed_vars = [
    'green_view','sky_view','interface_continuity','walkability','traffic_pressure','street_activity',
    '交通设施','生活服务','公司企业','汽车相关','商务住宅','休闲娱乐','酒店住宿','餐饮美食','购物消费','科教文化','医疗保健','旅游景点','运动健身','金融机构',
    '交通设施_1','生活服务_1','公司企业_1','汽车相关_1','商务住宅_1','休闲娱乐_1','酒店住宿_1','餐饮美食_1','购物消费_1','科教文化_1','医疗保健_1','旅游景点_1','运动健身_1','金融机构_1',
    'diversity','小区均价','总建面','容积率','绿化率','architecture'
]

# 生成分类列表：若活动表含 column 'category' 则用之，否则只用 'all'
if 'category' in activity_df.columns:
    categories = sorted(activity_df['category'].dropna().unique())
else:
    categories = ['all']

for cat in categories:
    cat_label = str(cat)
    safe_label = cat_label.replace('/', '_').replace('\\', '_').replace(' ', '_')
    cat_dir = os.path.join(save_dir, safe_label)
    os.makedirs(cat_dir, exist_ok=True)
    print(f'开始处理业态: {cat_label}，输出目录: {cat_dir}')

    # 复制网格数据以避免互相覆盖
    if grid_gdf is not None:
        grid_work = grid_gdf.copy()
    else:
        grid_work = grid_df.copy()

    # 过滤活动点
    if cat == 'all':
        act_sub = activity_df.copy()
    else:
        act_sub = activity_df[activity_df['category'] == cat].copy()

    if act_sub.shape[0] > 0 and grid_gdf is not None:
        activity_gdf_sub = gpd.GeoDataFrame(act_sub, geometry=[Point(xy) for xy in zip(act_sub['lon'], act_sub['lat'])], crs='EPSG:4326')
        try:
            activity_gdf_sub = activity_gdf_sub.to_crs(grid_work.crs)
        except Exception:
            pass

        try:
            activity_gdf_sub = gpd.sjoin(activity_gdf_sub, grid_work[['grid_id','geometry']], predicate='within', how='inner')
        except Exception:
            activity_gdf_sub = gpd.GeoDataFrame(columns=list(activity_gdf_sub.columns)+['grid_id'])

        activity_counts_sub = activity_gdf_sub.groupby('grid_id').size()
        grid_work['activity_count'] = grid_work['grid_id'].map(activity_counts_sub).fillna(0)
    else:
        # 无活动点或无矢量：全部置 0
        grid_work['activity_count'] = 0

    grid_work['log_activity'] = grid_work['activity_count'].apply(lambda x: math.log1p(x))

    # 特征列
    feature_cols_local = [c for c in allowed_vars if c in grid_work.columns]
    if len(feature_cols_local) == 0:
        feature_cols_local = [c for c in grid_work.columns if c not in ['activity_count','log_activity','geometry','grid_id']]

    X_local = grid_work[feature_cols_local].fillna(0)
    y_local = grid_work['log_activity']

    scaler_local = StandardScaler()
    X_scaled_local = scaler_local.fit_transform(X_local)

    if len(grid_work) < 2:
        X_train = X_scaled_local
        X_test = X_scaled_local
        y_train = y_local
        y_test = y_local
    else:
        X_train, X_test, y_train, y_test = train_test_split(X_scaled_local, y_local, test_size=0.2, random_state=42)

    # 训练随机森林（与原脚本一致的参数）
    rf_local = RandomForestRegressor(n_estimators=300, max_depth=10, random_state=42)
    rf_local.fit(X_train, y_train)

    # 预测与评估
    y_pred_full_local = rf_local.predict(X_scaled_local)
    grid_work['pred_rf'] = y_pred_full_local
    r2_full_local = r2_score(y_local.values, y_pred_full_local)
    try:
        y_pred_test_local = rf_local.predict(X_test)
        r2_test_local = r2_score(y_test, y_pred_test_local)
    except Exception:
        r2_test_local = float('nan')

    print(f'{cat_label} - RandomForest: R^2 (full) = {r2_full_local:.4f}, R^2 (test) = {r2_test_local:.4f}')

    # 保存 R2
    with open(os.path.join(cat_dir, 'rf_r2.txt'), 'w', encoding='utf-8') as f:
        f.write(f'R2_full,{r2_full_local}\n')
        f.write(f'R2_test,{r2_test_local}\n')

    # 特征重要性
    feat_imp_local = pd.Series(rf_local.feature_importances_, index=feature_cols_local).sort_values(ascending=False)
    feat_imp_local_df = feat_imp_local.reset_index()
    feat_imp_local_df.columns = ['feature','importance']
    feat_imp_local_df.to_csv(os.path.join(cat_dir, 'rf_feature_importance.csv'), index=False, encoding='utf-8-sig')

    # 可视化特征重要性
    plt.figure(figsize=(8, max(4, len(feat_imp_local_df)*0.3)))
    palette = sns.color_palette('viridis', n_colors=len(feat_imp_local_df))
    sns.barplot(x='importance', y='feature', data=feat_imp_local_df, palette=palette)
    plt.yticks(rotation=30, ha='right')
    plt.title(f'Random Forest Feature Importance - {cat_label}')
    plt.tight_layout()
    plt.savefig(os.path.join(cat_dir, 'rf_feature_importance.png'), dpi=300, bbox_inches='tight')
    plt.close()

    # 观测 vs 预测
    plt.figure(figsize=(6,6))
    plt.scatter(y_local.values, y_pred_full_local, alpha=0.6)
    plt.plot([y_local.min(), y_local.max()], [y_local.min(), y_local.max()], 'r--')
    plt.xlabel('Observed log_activity')
    plt.ylabel('Predicted log_activity')
    plt.title(f'Obs vs Pred (RF) - {cat_label}  R2={r2_full_local:.3f}')
    plt.tight_layout()
    plt.savefig(os.path.join(cat_dir, 'rf_obs_vs_pred.png'), dpi=300, bbox_inches='tight')
    plt.close()

    # 相关矩阵（所有因子）
    try:
        corr_all_local = X_local.corr()
        corr_all_local.to_csv(os.path.join(cat_dir, 'correlation_all.csv'), encoding='utf-8-sig')
        plt.figure(figsize=(12, max(6, len(corr_all_local)*0.18)))
        sns.heatmap(corr_all_local, cmap='vlag', center=0, cbar_kws={'shrink':0.6})
        plt.xticks(rotation=45, ha='right')
        plt.yticks(rotation=0)
        plt.title('Correlation Matrix - All Features')
        plt.tight_layout()
        plt.savefig(os.path.join(cat_dir, 'correlation_all_heatmap.png'), dpi=300, bbox_inches='tight')
        plt.close()
    except Exception as e:
        print(f'{cat_label} - 计算/保存所有因子相关矩阵失败:', e)

    # topN 分析函数（在本地作用域）
    def process_top_n_local(n, palette_name='rocket'):
        try:
            top_features = feat_imp_local_df['feature'].head(n).tolist()
            if len(top_features) == 0:
                raise ValueError('特征重要性为空，无法获取 top features')

            X_top = grid_work[top_features].fillna(0)
            corr_top = X_top.corr()
            corr_top.to_csv(os.path.join(cat_dir, f'correlation_top{n}.csv'), encoding='utf-8-sig')
            plt.figure(figsize=(8, max(4, len(top_features)*0.4)))
            sns.heatmap(corr_top, cmap='vlag', center=0, cbar_kws={'shrink':0.6})
            plt.xticks(rotation=45, ha='right')
            plt.yticks(rotation=0)
            plt.title(f'Correlation Matrix - Top {len(top_features)} Features')
            plt.tight_layout()
            plt.savefig(os.path.join(cat_dir, f'correlation_top{n}_heatmap.png'), dpi=300, bbox_inches='tight')
            plt.close()

            # 重新拟合 topN
            X_top_scaled = scaler_local.fit_transform(X_top)
            if len(grid_work) < 2:
                X_train_top = X_top_scaled
                X_test_top = X_top_scaled
                y_train_top = y_local
                y_test_top = y_local
            else:
                X_train_top, X_test_top, y_train_top, y_test_top = train_test_split(X_top_scaled, y_local, test_size=0.2, random_state=42)

            rf_topn = RandomForestRegressor(n_estimators=300, max_depth=10, random_state=42)
            rf_topn.fit(X_train_top, y_train_top)
            y_pred_full_top = rf_topn.predict(X_top_scaled)
            r2_full_top = r2_score(y_local.values, y_pred_full_top)
            try:
                y_pred_test_top = rf_topn.predict(X_test_top)
                r2_test_top = r2_score(y_test_top, y_pred_test_top)
            except Exception:
                r2_test_top = float('nan')

            with open(os.path.join(cat_dir, f'rf_top{n}_r2.txt'), 'w', encoding='utf-8') as f:
                f.write(f'R2_full_top{n},{r2_full_top}\n')
                f.write(f'R2_test_top{n},{r2_test_top}\n')

            feat_imp_top = pd.Series(rf_topn.feature_importances_, index=top_features).sort_values(ascending=False)
            feat_imp_top_df = feat_imp_top.reset_index()
            feat_imp_top_df.columns = ['feature','importance']
            feat_imp_top_df.to_csv(os.path.join(cat_dir, f'rf_top{n}_feature_importance.csv'), index=False, encoding='utf-8-sig')

            plt.figure(figsize=(8, max(3, len(feat_imp_top_df)*0.35)))
            palette = sns.color_palette(palette_name, n_colors=len(feat_imp_top_df))
            sns.barplot(x='importance', y='feature', data=feat_imp_top_df, palette=palette)
            plt.yticks(rotation=30, ha='right')
            plt.title(f'Random Forest Feature Importance (Top{n} Model)')
            plt.tight_layout()
            plt.savefig(os.path.join(cat_dir, f'rf_top{n}_feature_importance.png'), dpi=300, bbox_inches='tight')
            plt.close()

            plt.figure(figsize=(6,6))
            plt.scatter(y_local.values, y_pred_full_top, alpha=0.6)
            plt.plot([y_local.min(), y_local.max()], [y_local.min(), y_local.max()], 'r--')
            plt.xlabel('Observed log_activity')
            plt.ylabel('Predicted log_activity')
            plt.title(f'Obs vs Pred (RF Top{n})  R2={r2_full_top:.3f}')
            plt.tight_layout()
            plt.savefig(os.path.join(cat_dir, f'rf_top{n}_obs_vs_pred.png'), dpi=300, bbox_inches='tight')
            plt.close()

            print(f'{cat_label} - Top{n} 结果已保存')
        except Exception as e:
            print(f'{cat_label} - Top{n} 处理失败:', e)

    # 执行 top8 与 top10 分析
    process_top_n_local(8, palette_name='rocket')
    process_top_n_local(10, palette_name='mako')

print('全部完成，输出目录：', save_dir)
