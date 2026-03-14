import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import * as shapefile from "shapefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API route to get Xuhui POI Diversity data
  app.get("/api/data/poi-diversity", async (req, res) => {
    try {
      const shpPath = path.join(__dirname, "Xuhui_POI_diversity.shp");
      const dbfPath = path.join(__dirname, "Xuhui_POI_diversity.dbf");

      if (!fs.existsSync(shpPath) || !fs.existsSync(dbfPath)) {
        return res.status(404).json({ error: "POI Diversity data files not found" });
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

  // Serve static files from public directory
  app.use(express.static(path.join(__dirname, "public")));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
