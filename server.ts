import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import net from "net";
import * as shapefile from "shapefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const preferredPort = 3000;

  const findAvailablePort = async (startPort: number): Promise<number> => {
    const isPortFree = (port: number) =>
      new Promise<boolean>((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => {
          server.close(() => resolve(true));
        });
        server.listen(port, "0.0.0.0");
      });

    let port = startPort;
    while (!(await isPortFree(port))) {
      port += 1;
      if (port > startPort + 50) {
        throw new Error("No available port found in range");
      }
    }
    return port;
  };

  const PORT = await findAvailablePort(preferredPort);

  // API route to get Xuhui POI Diversity data
  app.get("/api/data/poi-diversity", async (req, res) => {
    try {
      // Prefer a pre-generated JSON/GeoJSON if present, or a project GeoJSON file.
      const publicJson = path.join(__dirname, 'public', 'api', 'data', 'poi-diversity.json');
      const rootJson = path.join(__dirname, 'poi-diversity.json');
      const rootGeo = path.join(__dirname, 'grid_100m_xh.geojson');

      if (fs.existsSync(publicJson)) {
        const txt = await fs.promises.readFile(publicJson, 'utf-8');
        return res.json(JSON.parse(txt));
      }

      if (fs.existsSync(rootJson)) {
        const txt = await fs.promises.readFile(rootJson, 'utf-8');
        return res.json(JSON.parse(txt));
      }

      if (fs.existsSync(rootGeo)) {
        const txt = await fs.promises.readFile(rootGeo, 'utf-8');
        return res.json(JSON.parse(txt));
      }

      // Fallback: if older SHP/DBF exist, still support them for compatibility.
      const shpPath = path.join(__dirname, "Xuhui_POI_diversity.shp");
      const dbfPath = path.join(__dirname, "Xuhui_POI_diversity.dbf");

      if (!fs.existsSync(shpPath) || !fs.existsSync(dbfPath)) {
        return res.status(404).json({ error: "POI Diversity data not found (checked JSON/GeoJSON and SHP)" });
      }

      const features = [];
      const source = await shapefile.open(shpPath, dbfPath, { encoding: "utf-8" });
      let result;
      while (!(result = await source.read()).done) {
        features.push(result.value);
      }

      res.json({ type: "FeatureCollection", features: features });
    } catch (error) {
      console.error("Error reading POI diversity SHP:", error);
      res.status(500).json({ error: "Failed to process SHP data" });
    }
  });

  // API route to get Xuhui Boundary data
  app.get("/api/data/boundary", async (req, res) => {
    try {
      const jsonPath = path.join(__dirname, "310104.json");
      if (fs.existsSync(jsonPath)) {
        const jsonText = await fs.promises.readFile(jsonPath, "utf-8");
        const jsonData = JSON.parse(jsonText);
        return res.json(jsonData);
      }

      const shpPath = path.join(__dirname, "310104.shp");
      const dbfPath = path.join(__dirname, "310104.dbf");

      if (!fs.existsSync(shpPath) || !fs.existsSync(dbfPath)) {
        return res.status(404).json({ error: "Boundary data files not found" });
      }

      const features = [];
      const source = await shapefile.open(shpPath, dbfPath, { encoding: "utf-8" });
      
      let result;
      while (!(result = await source.read()).done) {
        features.push(result.value);
      }

      res.json({
        type: "FeatureCollection",
        features: features
      });
    } catch (error) {
      console.error("Error reading boundary SHP:", error);
      res.status(500).json({ error: "Failed to process boundary data" });
    }
  });

  // API route to get merged area (merged_area84) data
  app.get("/api/data/merged-area", async (req, res) => {
    try {
      const geojsonPath = path.join(__dirname, "merge_shp", "merged_area84.geojson");
      if (fs.existsSync(geojsonPath)) {
        const jsonText = await fs.promises.readFile(geojsonPath, "utf-8");
        const jsonData = JSON.parse(jsonText);
        return res.json(jsonData);
      }

      const shpPath = path.join(__dirname, "merge_shp", "merged_area84.shp");
      const dbfPath = path.join(__dirname, "merge_shp", "merged_area84.dbf");

      if (!fs.existsSync(shpPath) || !fs.existsSync(dbfPath)) {
        return res.status(404).json({ error: "Merged area data files not found" });
      }

      const features = [];
      const source = await shapefile.open(shpPath, dbfPath, { encoding: "utf-8" });
      let result;
      while (!(result = await source.read()).done) {
        features.push(result.value);
      }

      res.json({
        type: "FeatureCollection",
        features: features,
      });
    } catch (error) {
      console.error("Error reading merged area SHP:", error);
      res.status(500).json({ error: "Failed to process merged area data" });
    }
  });

  // API route to get merged road GeoJSON data from road/*.json
  app.get("/api/data/roads", async (req, res) => {
    try {
      const roadDir = path.join(__dirname, "road");
      const roadFiles = [
        "shanghai_roads_nw_part1.json",
        "shanghai_roads_nw_part2.json",
        "shanghai_roads_nw_part3.json",
      ];

      const features = [] as any[];

      for (const fileName of roadFiles) {
        const filePath = path.join(roadDir, fileName);
        if (!fs.existsSync(filePath)) {
          continue;
        }

        const text = await fs.promises.readFile(filePath, "utf-8");
        const json = JSON.parse(text);
        if (Array.isArray(json?.features)) {
          features.push(...json.features);
        }
      }

      if (features.length === 0) {
        return res.status(404).json({ error: "Road data files not found" });
      }

      res.json({
        type: "FeatureCollection",
        features,
      });
    } catch (error) {
      console.error("Error reading road GeoJSON:", error);
      res.status(500).json({ error: "Failed to process road data" });
    }
  });

  // Serve CSV metrics via API so frontend doesn't fetch static files directly
  const serveCsv = (urlPath: string, fileName: string) => {
    app.get(urlPath, async (req, res) => {
      try {
        const filePath = path.join(__dirname, fileName);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ error: `${fileName} not found` });
        }
        const txt = await fs.promises.readFile(filePath, 'utf-8');
        res.type('text/csv').send(txt);
      } catch (err) {
        console.error(`Error serving ${fileName}:`, err);
        res.status(500).json({ error: `Failed to read ${fileName}` });
      }
    });
  };

  serveCsv('/api/data/houseprice', 'house_grid_100m_xh.csv');
  serveCsv('/api/data/streetview', 'Xuhui_streetview_grid_metrics.csv');
  serveCsv('/api/data/activity', 'Xuhui_activity_grid.csv');
  serveCsv('/api/data/road-metrics', 'Xuhui_Road_Network_Data_Fixed.csv');

  // Serve static files from public directory
  app.use(express.static(path.join(__dirname, "public")));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        strictPort: false,
        hmr: {
          port: PORT + 1,
        },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    if (PORT !== preferredPort) {
      console.log(`Port ${preferredPort} is occupied, switched to ${PORT}`);
    }
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
