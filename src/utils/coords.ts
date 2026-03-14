
/**
 * Coordinate correction for GCJ-02 to WGS-84
 * Based on the Python implementation provided by the user
 */

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function transformLat(lng: number, lat: number): number {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lat * PI) + 40.0 * Math.sin(lat / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(lat / 12.0 * PI) + 320 * Math.sin(lat * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(lng: number, lat: number): number {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng));
  ret += (20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(lng * PI) + 40.0 * Math.sin(lng / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(lng / 12.0 * PI) + 300.0 * Math.sin(lng / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

export function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  // If coordinates look like they are in meters (projected), don't correct them
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
    return [lng, lat];
  }

  let dlat = transformLat(lng - 105.0, lat - 35.0);
  let dlng = transformLng(lng - 105.0, lat - 35.0);
  const radlat = lat / 180.0 * PI;
  let magic = Math.sin(radlat);
  magic = 1 - EE * magic * magic;
  const sqrtmagic = Math.sqrt(magic);
  dlat = (dlat * 180.0) / ((A * (1 - EE)) / (magic * sqrtmagic) * PI);
  dlng = (dlng * 180.0) / (A / sqrtmagic * Math.cos(radlat) * PI);
  const mglat = lat + dlat;
  const mglng = lng + dlng;
  return [lng * 2 - mglng, lat * 2 - mglat];
}

export function bd09ToGcj02(bd_lng: number, bd_lat: number): [number, number] {
  const x = bd_lng - 0.0065;
  const y = bd_lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * PI);
  const gcj_lng = z * Math.cos(theta);
  const gcj_lat = z * Math.sin(theta);
  return [gcj_lng, gcj_lat];
}

export function bd09ToWgs84(bd_lng: number, bd_lat: number): [number, number] {
  const [gcj_lng, gcj_lat] = bd09ToGcj02(bd_lng, bd_lat);
  return gcj02ToWgs84(gcj_lng, gcj_lat);
}

/**
 * Recursively correct GeoJSON geometry coordinates
 */
export function correctGeoJSON(geojson: any): any {
  if (!geojson) return geojson;

  const processCoords = (coords: any): any => {
    if (!Array.isArray(coords)) return coords;
    
    // Check if this is a point [lng, lat]
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      return gcj02ToWgs84(coords[0], coords[1]);
    }
    
    // Otherwise recurse
    return coords.map(processCoords);
  };

  if (geojson.type === 'FeatureCollection') {
    return {
      ...geojson,
      features: geojson.features.map((f: any) => ({
        ...f,
        geometry: f.geometry ? {
          ...f.geometry,
          coordinates: processCoords(f.geometry.coordinates)
        } : null
      }))
    };
  } else if (geojson.type === 'Feature') {
    return {
      ...geojson,
      geometry: geojson.geometry ? {
        ...geojson.geometry,
        coordinates: processCoords(geojson.geometry.coordinates)
      } : null
    };
  } else if (geojson.coordinates) {
    return {
      ...geojson,
      coordinates: processCoords(geojson.coordinates)
    };
  }
  return geojson;
}
