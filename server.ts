import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import net from 'net';
import * as shapefile from 'shapefile';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const findFirstExistingPath = (...relativePaths: string[]) => {
  for (const rel of relativePaths) {
    const full = path.join(__dirname, rel);
    if (fs.existsSync(full)) return full;
  }
  return null;
};

const readJsonFile = async (filePath: string) => {
  const raw = await fs.promises.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
};

const readShpAsGeoJson = async (shpPath: string, dbfPath: string) => {
  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });
  const features: any[] = [];
  let result;
  while (!(result = await source.read()).done) {
    features.push(result.value);
  }
  return {
    type: 'FeatureCollection',
    features,
  };
};

const serveCsv = (app: express.Express, apiPath: string, ...candidates: string[]) => {
  app.get(apiPath, async (_req, res) => {
    try {
      const target = findFirstExistingPath(...candidates);
      if (!target) {
        return res.status(404).json({ error: `${apiPath} source file not found` });
      }
      const text = await fs.promises.readFile(target, 'utf-8');
      res.type('text/csv').send(text);
    } catch (error) {
      console.error(`${apiPath} read failed`, error);
      res.status(500).json({ error: `${apiPath} read failed` });
    }
  });
};

async function startServer() {
  const app = express();
  const preferredPort = 3000;

  const findAvailablePort = async (startPort: number): Promise<number> => {
    const isPortFree = (port: number) =>
      new Promise<boolean>((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
          server.close(() => resolve(true));
        });
        server.listen(port, '0.0.0.0');
      });

    let port = startPort;
    while (!(await isPortFree(port))) {
      port += 1;
      if (port > startPort + 50) {
        throw new Error('No available port found in range');
      }
    }
    return port;
  };

  const PORT = await findAvailablePort(preferredPort);

  app.get('/api/data/xuhui-boundary', async (_req, res) => {
    try {
      const jsonPath = findFirstExistingPath('徐汇区边界/310104.json');
      if (jsonPath) {
        return res.json(await readJsonFile(jsonPath));
      }

      const shpPath = findFirstExistingPath('徐汇区边界/310104.shp');
      const dbfPath = findFirstExistingPath('徐汇区边界/310104.dbf');
      if (!shpPath || !dbfPath) {
        return res.status(404).json({ error: '徐汇区边界数据不存在' });
      }
      const geojson = await readShpAsGeoJson(shpPath, dbfPath);
      return res.json(geojson);
    } catch (error) {
      console.error('/api/data/xuhui-boundary failed', error);
      res.status(500).json({ error: '徐汇区边界读取失败' });
    }
  });

  app.get('/api/data/dxjh-boundary', async (_req, res) => {
    try {
      const shpPath = findFirstExistingPath('大徐家汇边界/merged_area_clean.shp');
      const dbfPath = findFirstExistingPath('大徐家汇边界/merged_area_clean.dbf');
      if (shpPath && dbfPath) {
        const geojson = await readShpAsGeoJson(shpPath, dbfPath);
        return res.json(geojson);
      }

      const jsonPath = findFirstExistingPath(
        '大徐家汇边界/merged_area_clean.geojson',
        '大徐家汇边界/merged_area_clean.json'
      );
      if (jsonPath) {
        return res.json(await readJsonFile(jsonPath));
      }

      return res.status(404).json({ error: '大徐家汇边界数据不存在' });
    } catch (error) {
      console.error('/api/data/dxjh-boundary failed', error);
      res.status(500).json({ error: '大徐家汇边界读取失败' });
    }
  });

  app.get('/api/data/xuhui-grid', async (_req, res) => {
    try {
      const gridPath = findFirstExistingPath('徐汇区100m网格.geojson');
      if (!gridPath) {
        return res.status(404).json({ error: '网格数据不存在' });
      }
      return res.json(await readJsonFile(gridPath));
    } catch (error) {
      console.error('/api/data/xuhui-grid failed', error);
      res.status(500).json({ error: '网格数据读取失败' });
    }
  });

  app.get('/api/data/dxjh-grid', async (_req, res) => {
    try {
      const gridPath = findFirstExistingPath('大徐家汇100m网格.geojson');
      if (!gridPath) {
        return res.status(404).json({ error: '大徐家汇网格数据不存在' });
      }
      return res.json(await readJsonFile(gridPath));
    } catch (error) {
      console.error('/api/data/dxjh-grid failed', error);
      res.status(500).json({ error: '大徐家汇网格数据读取失败' });
    }
  });

  app.get('/api/data/roads', async (_req, res) => {
    try {
      const files = [
        '路网/shanghai_roads_nw_part1.json',
        '路网/shanghai_roads_nw_part2.json',
        '路网/shanghai_roads_nw_part3.json',
      ];

      const features: any[] = [];
      for (const file of files) {
        const full = findFirstExistingPath(file);
        if (!full) continue;
        const parsed = await readJsonFile(full);
        if (Array.isArray(parsed?.features)) {
          features.push(...parsed.features);
        }
      }

      if (features.length === 0) {
        return res.status(404).json({ error: '路网数据不存在' });
      }

      return res.json({ type: 'FeatureCollection', features });
    } catch (error) {
      console.error('/api/data/roads failed', error);
      res.status(500).json({ error: '路网数据读取失败' });
    }
  });

  serveCsv(app, '/api/data/poi', '徐汇-POI.csv', 'xuhui_100m_poi.csv');
  serveCsv(app, '/api/data/house-price', '徐汇-房价.csv', 'house_grid_100m_xh.csv');
  serveCsv(app, '/api/data/street-view', '徐汇-街景.csv', 'Xuhui_streetview_grid_metrics.csv');
  serveCsv(app, '/api/data/dxjh-metrics', '大徐家汇网格数据库.csv');

  const importanceFileMap: Record<string, string> = {
    ACGN: '影响因子权重/ACGN_importance.csv',
    Auto: '影响因子权重/Auto_importance.csv',
    'F&B': '影响因子权重/F&B_importance.csv',
    Public: '影响因子权重/Public_importance.csv',
    Star: '影响因子权重/Stars_importance.csv',
    Lifestyle: '影响因子权重/Lifestyle_importance.csv',
    Beauty: '影响因子权重/Beauty_importance.csv',
    'Culture&Art': '影响因子权重/Culture&art_importance.csv',
    Overall: '影响因子权重/Overall_importance.csv',
  };

  const attractionFileMap: Record<string, string> = {
    ACGN: '网格吸引力/ACGN_A_baseline.csv',
    Auto: '网格吸引力/Auto_A_baseline.csv',
    'F&B': '网格吸引力/F&B_A_baseline.csv',
    Public: '网格吸引力/Public_A_baseline.csv',
    Star: '网格吸引力/Stars_A_baseline.csv',
    Lifestyle: '网格吸引力/Lifestyle_A_baseline.csv',
    Beauty: '网格吸引力/Beauty_A_baseline.csv',
    'Culture&Art': '网格吸引力/Culture&Art_A_baseline.csv',
  };

  app.get('/api/data/importance/:category', async (req, res) => {
    try {
      const category = String(req.params.category || '');
      const relPath = importanceFileMap[category];
      if (!relPath) {
        return res.status(400).json({ error: 'importance category invalid' });
      }

      const target = findFirstExistingPath(relPath);
      if (!target) {
        return res.status(404).json({ error: 'importance file not found' });
      }

      const text = await fs.promises.readFile(target, 'utf-8');
      res.type('text/csv').send(text);
    } catch (error) {
      console.error('/api/data/importance/:category failed', error);
      res.status(500).json({ error: 'importance read failed' });
    }
  });

  app.get('/api/data/attraction/:category', async (req, res) => {
    try {
      const category = String(req.params.category || '');
      const relPath = attractionFileMap[category];
      if (!relPath) {
        return res.status(400).json({ error: 'attraction category invalid' });
      }

      const target = findFirstExistingPath(relPath);
      if (!target) {
        return res.status(404).json({ error: 'attraction file not found' });
      }

      const text = await fs.promises.readFile(target, 'utf-8');
      res.type('text/csv').send(text);
    } catch (error) {
      console.error('/api/data/attraction/:category failed', error);
      res.status(500).json({ error: 'attraction read failed' });
    }
  });

  app.get('/api/data/time-weights', async (_req, res) => {
    try {
      const target = findFirstExistingPath('时间分析权重.json');
      if (!target) {
        return res.status(404).json({ error: 'time weights file not found' });
      }
      return res.json(await readJsonFile(target));
    } catch (error) {
      console.error('/api/data/time-weights failed', error);
      res.status(500).json({ error: 'time weights read failed' });
    }
  });

  app.use(express.static(path.join(__dirname, 'public')));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        strictPort: false,
        hmr: { port: PORT + 1 },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    if (PORT !== preferredPort) {
      console.log(`Port ${preferredPort} occupied, switched to ${PORT}`);
    }
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
