import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMap, useMapEvents } from 'react-leaflet';
import Papa from 'papaparse';
import JSZip from 'jszip';
import packageJson from '../../../package.json';


export const parseCoords = (input) => {
  // Matches "12.34, 56.78", "12.34 56.78", etc.
  const regex = /(-?\d+\.?\d*)\s*[,|:\s]\s*(-?\d+\.?\d*)/;
  const match = input.match(regex);
  if (match) {
    const v1 = parseFloat(match[1]);
    const v2 = parseFloat(match[2]);

    // Heuristic for region: If one value is > 60, it's likely Longitude (India is ~68-98E, 8-37N)
    let lat, lng;
    if (Math.abs(v1) > Math.abs(v2) && Math.abs(v1) > 40) {
      lng = v1; lat = v2;
    } else {
      lat = v1; lng = v2;
    }

    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
  }
  return null;
};

/**
 * Geodesic distance between two points in meters (Haversine formula)
 */
export const getGeodesicDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // meters
};

/**
 * Utility to find joint boxes overlapping within a 20m radius
 */
export const checkJointBoxOverlap = (multiMapData) => {
  const allJBs = [];
  Object.entries(multiMapData).forEach(([lid, files]) => {
    Object.entries(files).forEach(([fName, pts]) => {
      pts.forEach((p, idx) => {
        if (p.jointBox) {
          allJBs.push({ ...p, lid, fName, seqIdx: idx + 1 });
        }
      });
    });
  });

  console.log(`[JB SCANNER] Analyzing ${allJBs.length} JV locations across all lots...`);
  const results = [];
  for (let i = 0; i < allJBs.length; i++) {
    for (let j = i + 1; j < allJBs.length; j++) {
      const jb1 = allJBs[i];
      const jb2 = allJBs[j];
      const dist = getGeodesicDistance(jb1.lat, jb1.lng, jb2.lat, jb2.lng);

      if (dist < 20) {
        results.push({
          "Distance (m)": parseFloat(dist.toFixed(2)),
          "Lot A": jb1.lid.toUpperCase(),
          "File A": jb1.fName,
          "Tower A": jb1.towerNo || 'N/A',
          "Type A": jb1.jointBox,
          "Lot B": jb2.lid.toUpperCase(),
          "File B": jb2.fName,
          "Tower B": jb2.towerNo || 'N/A',
          "Type B": jb2.jointBox,
          "Coords A": `${jb1.lat.toFixed(6)}, ${jb1.lng.toFixed(6)}`,
          "Coords B": `${jb2.lat.toFixed(6)}, ${jb2.lng.toFixed(6)}`
        });
      }
    }
  }

  if (results.length === 0) {
    console.log("%c✓ NO DUPLICATE JOINT BOXES FOUND", "color: #10b981; font-weight: bold; font-size: 11px;");
  } else {
    console.group(`%c⚠ FOUND ${results.length} POTENTIAL DUPLICATES (< 20m RADIUS)`, "color: #ef4444; font-weight: bold; font-size: 12px;");
    console.table(results);
    console.groupEnd();
  }
  return results;
};

// Centralized CSV coordinate/tower extraction logic
export const extractPointsFromCSV = (data, fileName = 'Unknown File') => {
  if (!Array.isArray(data) || data.length === 0) return [];

  const keys = Object.keys(data[0]);
  const hasJointBox = keys.some(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'jointbox');

  const validationErrors = [];
  const rKeys = Object.keys(data[0] || {});
  const towerNoKey = rKeys.find(k => {
    const low = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Specifically look for Tower No fragments, ignore sno, sn, serialno
    return (low.includes('towerno') || low.includes('tno') || low === 'tower') && !low.includes('sno') && !low.includes('slno');
  });

  if (!towerNoKey) {
    console.warn(`[TOWER NO DETECTION] Could not find valid Tower No column in "${fileName}". Checked: ${rKeys.join(', ')}`);
  }

  const pts = data.map(row => {
    const latKey = rKeys.find(k => {
      const low = k.toLowerCase().replace(/[^a-z]/g, '');
      return low === 'latitude' || low === 'lat';
    });
    const lngKey = rKeys.find(k => {
      const low = k.toLowerCase().replace(/[^a-z]/g, '');
      return low === 'longitude' || low === 'lng' || low === 'long' || low === 'lon';
    });
    const jointBoxKey = rKeys.find(k => {
      const low = k.toLowerCase().replace(/[^a-z]/g, '');
      return low === 'jointbox';
    });

    const lat = latKey ? parseFloat(row[latKey]) : NaN;
    const lng = lngKey ? parseFloat(row[lngKey]) : NaN;

    const jbValue = jointBoxKey ? (row[jointBoxKey] || '').toString().trim().toUpperCase() : null;

    // Check for invalid values and push to a separate error collection (handled after map)
    if (jointBoxKey && row[jointBoxKey] && (row[jointBoxKey] || '').toString().trim() !== '' && !['2W', '3W', '4W'].includes(jbValue)) {
      validationErrors.push(`Tower ${towerNoKey ? row[towerNoKey] : 'N/A'} (Value: "${row[jointBoxKey]}")`);
    }

    const jointBox = ['2W', '3W', '4W'].includes(jbValue) ? jbValue : null;

    return {
      lat,
      lng,
      towerNo: towerNoKey ? (row[towerNoKey] || '').toString().trim() : '',
      description: row.Description || row.description,
      jointBox
    };
  }).filter(pt => !isNaN(pt.lat) && !isNaN(pt.lng));

  // Log summary of validation errors if any were found
  if (validationErrors.length > 0) {
    console.warn(`[JOINT BOX VALIDATION] Found ${validationErrors.length} invalid values in "${fileName}":\n  • ${validationErrors.join('\n  • ')}`);
  }

  pts.hasJointBox = hasJointBox;
  return pts;
};

/**
 * Fetches a zip file and extracts it using JSZip
 */
export const fetchAndUnzip = async (zipUrl) => {
  const resp = await fetch(zipUrl);
  if (!resp.ok) throw new Error(`Zip bundle not found: ${zipUrl}`);
  const blob = await resp.blob();
  const zip = await JSZip.loadAsync(blob);
  return zip;
};

/**
 * Parses index.txt and extracts version and file listing
 */
export const parseIndexFile = (text) => {
  const lines = text.split('\n').map(l => l.trim());
  const versionLine = lines.find(l => l.startsWith('#v:'));
  const version = versionLine ? versionLine.split(':')[1] : null;
  const files = lines.filter(l => l.length > 0 && !l.startsWith('#'))
    .map(l => l.endsWith('.') ? l.slice(0, -1) : l);
  return { version, files };
};

export const resolveFileUrl = (basePath, fileName) => {
  if (fileName.includes('/') && (fileName.startsWith('LOT_') || fileName.startsWith('EXISTING/'))) {
    return `/view/${fileName}`;
  }
  return `${basePath}${fileName}`;
};

export const getCoordinateFromParams = (searchParams) => {
  const lat = searchParams.get('lat') || searchParams.get('latitude');
  const lng = searchParams.get('lng') || searchParams.get('longitude');
  if (lat && lng) {
    return { lat: parseFloat(lat), lng: parseFloat(lng) };
  }

  const combined = searchParams.get('coords') || searchParams.get('coord') || searchParams.get('c');
  if (combined) {
    return parseCoords(combined);
  }
  return null;
};

export const updatedLots = [
  { id: 'lot1', name: 'LOT 1', basePath: '/view/LOT_1/', color: '#6366F1' },
  { id: 'lot2', name: 'LOT 2', basePath: '/view/LOT_2/', color: '#10B981' },
  { id: 'lot3', name: 'LOT 3', basePath: '/view/LOT_3_TNEB/', color: '#F59E0B' },
  { id: 'lot4', name: 'LOT 4', basePath: '/view/LOT_4/', color: '#F43F5E' },
  { id: 'glease1', name: 'G LEASE 1', basePath: '/view/G_LEASE_1/', color: '#1310CC' },
  { id: 'glease2', name: 'G LEASE 2', basePath: '/view/G_LEASE_2/', color: '#EC4899' },
  { id: 'gcombined', name: 'G COMBINED', basePath: '/view/G_COMBINED/', color: '#FFFC32' },
  { id: 'existing', name: 'Existing', basePath: '/view/EXISTING/', color: '#6B7280' }
];


export const APP_VERSION = packageJson.version;

// Helper to fit map bounds dynamically
export const ChangeView = ({ bounds, center, zoom }) => {
  const map = useMap();
  const lastBounds = React.useRef(null);
  const lastCenter = React.useRef(null);

  useEffect(() => {
    if (bounds && bounds !== lastBounds.current) {
      map.fitBounds(bounds, { animate: true });
      lastBounds.current = bounds;
      setTimeout(() => map.invalidateSize(), 250);
    }
  }, [bounds, map]);

  useEffect(() => {
    if (center && center !== lastCenter.current) {
      map.setView(center, zoom || 15, { animate: true });
      lastCenter.current = center;
      setTimeout(() => map.invalidateSize(), 250);
    }
  }, [center, zoom, map]);

  return null;
};

// Shared Zoom Handler Utility
export const ZoomHandler = ({ onZoom }) => {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom())
  });
  return null;
};

// Right-click to copy coordinates handler
export const CopyCoordsHandler = () => {
  const [pos, setPos] = useState(null);
  const [copied, setCopied] = useState(false);

  useMapEvents({
    contextmenu: (e) => {
      setPos({ x: e.originalEvent.pageX, y: e.originalEvent.pageY, lat: e.latlng.lat, lng: e.latlng.lng });
      setCopied(false);
    },
    click: (e) => {
      // Don't close if clicking inside the popup
      if (e.originalEvent && e.originalEvent.target && e.originalEvent.target.closest('.coordinate-popup')) return;
      setPos(null);
    },
    movestart: () => setPos(null)
  });

  const handleCopy = () => {
    if (!pos) return;
    const text = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => markCopied())
        .catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  const markCopied = () => {
    setCopied(true);
    setTimeout(() => setPos(null), 1000);
  };

  const fallbackCopy = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      markCopied();
    } catch (err) { }
    document.body.removeChild(textArea);
  };

  if (!pos) return null;

  return createPortal(
    <div
      className="coordinate-popup"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 10000,
        background: 'white',
        padding: '6px 12px',
        borderRadius: '8px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        border: '1px solid #f1f5f9',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        cursor: 'default'
      }}
    >
      <span
        className="text-[11px] font-mono select-text text-gray-600 bg-gray-50 px-2 py-1 rounded border border-gray-100 italic cursor-text"
        onMouseDown={(e) => e.stopPropagation()}
        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
      >
        {pos.lat.toFixed(6)}, {pos.lng.toFixed(6)}
      </span>
      <button
        onClick={handleCopy}
        className={`p-1.5 rounded-md transition-all shrink-0 ${copied ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-primary-blue hover:bg-slate-50'}`}
        title={copied ? "Copied!" : "Copy Coordinates"}
      >
        {copied ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        )}
      </button>
    </div>,
    document.body
  );
};

export const OPACITY_KEY = 'mapOpacity';
export const DEFAULT_OPACITY = 1.0;
export const SHOW_MAP_KEY = 'showBackgroundMap';
export const DEFAULT_SHOW_MAP = true;
export const SHOW_SS_LABELS_KEY = 'showSubStationLabels';
export const DEFAULT_SS_LABELS = true;
export const SHOW_LINE_LABELS_KEY = 'showLineLabels';
export const DEFAULT_LINE_LABELS = true;

const escapeXml = (unsafe) => {
  if (typeof unsafe !== 'string') return unsafe;
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

const hexToRgb = (hex) => {
  if (!hex || !hex.startsWith('#')) return '0,0,0,255';
  
  if (hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b},255`;
  }
  
  if (hex.length === 9) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = parseInt(hex.slice(7, 9), 16);
    return `${r},${g},${b},${a}`;
  }
  
  return '0,0,0,255';
};

/**
 * Generates a QGIS .qgs project XML string and triggers download
 */
export const exportQGISProject = async (layers, projectName = "survey_project", onProgress, mapExtent = null) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipFileName = `${projectName}_${timestamp}.zip`;

  // Calculate project extent
  let xmin, ymin, xmax, ymax;
  if (mapExtent && typeof mapExtent.getWest === 'function') {
    xmin = mapExtent.getWest();
    ymin = mapExtent.getSouth();
    xmax = mapExtent.getEast();
    ymax = mapExtent.getNorth();
  } else {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    layers.forEach(l => {
      l.pts.forEach(p => {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng;
        if (p.lng > maxLng) maxLng = p.lng;
      });
    });
    if (minLat !== Infinity) {
      const pad = 0.005;
      xmin = minLng - pad; ymin = minLat - pad;
      xmax = maxLng + pad; ymax = maxLat + pad;
    }
  }

  const mapCanvasXml = xmin !== undefined ? `
  <mapcanvas>
    <units>degrees</units>
    <extent>
      <xmin>${xmin}</xmin>
      <ymin>${ymin}</ymin>
      <xmax>${xmax}</xmax>
      <ymax>${ymax}</ymax>
    </extent>
  </mapcanvas>` : '';

  // Fetch config to mirror symbology
  let config = null;
  try {
    const resp = await fetch('/substation_config.json');
    if (resp.ok) config = await resp.json();
  } catch (e) { console.warn("Symbology config not found, using fallbacks."); }

  const zip = new JSZip();
  const dataFolder = zip.folder("data");
  const iconsFolder = zip.folder("icons");
  const getSvgText = (type, color) => {
    const connectors = {
      '4W': '<rect x="10" y="1" width="4" height="4" rx="0.5"/><rect x="10" y="19" width="4" height="4" rx="0.5"/><rect x="1" y="10" width="4" height="4" rx="0.5"/><rect x="19" y="10" width="4" height="4" rx="0.5"/>',
      '3W': '<rect x="10" y="1" width="4" height="4" rx="0.5"/><rect x="10" y="19" width="4" height="4" rx="0.5"/><rect x="1" y="10" width="4" height="4" rx="0.5"/>',
      '2W': '<rect x="10" y="1" width="4" height="4" rx="0.5"/><rect x="10" y="19" width="4" height="4" rx="0.5"/>'
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2" fill="white" stroke="${color}" stroke-width="1.5"/><g fill="#444">${connectors[type] || ''}</g><circle cx="12" cy="12" r="3.5" fill="${color}"/><path d="M12 9l-1.5 2.5h3L12 14" stroke="white" stroke-width="1" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  };
  const mapLayersXml = [];

  // Tree Nodes
  const lotGroups = {};
  let progressCounter = 0;
  const totalLayers = layers.length;
  const totalSteps = totalLayers * 2 + 5;

  for (const layer of layers) {
    const { id, name, color } = layer;
    const lotId = id.split('_')[0];
    const lotDef = updatedLots.find(l => l.id === lotId) || { name: lotId.toUpperCase(), id: lotId };

    if (!lotGroups[lotId]) {
      lotGroups[lotId] = {
        name: lotDef.name,
        pathNodes: [],
        pointNodes: []
      };
    }

    // Use ID for unique filenames to avoid collisions
    const safeBaseName = id.replace(/[^a-z0-9_-]/gi, '_');

    // ─── 0. PREPARE ENRICHED CSV (Standardized & De-duplicated) ────
    let combinedCsvData = "";
    const lineLabel = name.split(' ')[1] || name.split(' ')[0];

    // Handle split files like "file.csv@1:58"
    const rangeMatch = name.match(/@(\d+):(\d+)$/);
    const actualFileName = rangeMatch ? name.substring(0, rangeMatch.index) : name;

    try {
      const fetchUrl = lotDef.basePath ? resolveFileUrl(lotDef.basePath, actualFileName) : null;
      if (fetchUrl) {
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const fileData = await res.text();
          let parsed = Papa.parse(fileData, { header: true, skipEmptyLines: true });
          
          if (parsed.data && parsed.data.length > 0) {
            // Apply range slicing if @start:end is present
            if (rangeMatch) {
              const start = parseInt(rangeMatch[1]);
              const end = parseInt(rangeMatch[2]);
              parsed.data = parsed.data.slice(start - 1, end);
            }

            const rKeys = Object.keys(parsed.data[0] || {});
            const towerNoKey = rKeys.find(k => {
              const low = k.toLowerCase().replace(/[^a-z0-9]/g, '');
              return (low.includes('towerno') || low.includes('tno') || low === 'tower') && !low.includes('sno') && !low.includes('slno');
            });
            const jointBoxKey = rKeys.find(k => k.toLowerCase().replace(/[^a-z]/g, '') === 'jointbox');
            const latKey = rKeys.find(k => {
              const low = k.toLowerCase().replace(/[^a-z]/g, '');
              return low === 'latitude' || low === 'lat';
            });
            const lngKey = rKeys.find(k => {
              const low = k.toLowerCase().replace(/[^a-z]/g, '');
              return low === 'longitude' || low === 'lng' || low === 'long' || low === 'lon';
            });

            const enriched = parsed.data.map((row, idx) => {
              const newRow = { ...row };
              
              // Standardize existing headers to avoid duplication
              if (latKey && latKey !== "Latitude") { newRow["Latitude"] = row[latKey]; delete newRow[latKey]; }
              else if (!latKey) { newRow["Latitude"] = ""; }
              
              if (lngKey && lngKey !== "Longitude") { newRow["Longitude"] = row[lngKey]; delete newRow[lngKey]; }
              else if (!lngKey) { newRow["Longitude"] = ""; }

              if (towerNoKey && towerNoKey !== "Tower_No") { newRow["Tower_No"] = row[towerNoKey]; delete newRow[towerNoKey]; }
              if (jointBoxKey && jointBoxKey !== "Joint_Box") { 
                newRow["Joint_Box"] = (row[jointBoxKey] || '').toString().trim().toUpperCase(); 
                if (jointBoxKey !== "Joint_Box") delete newRow[jointBoxKey]; 
              }
              
              return newRow;
            });
            combinedCsvData = Papa.unparse(enriched);
          }
        }
      }
    } catch (e) {
      console.warn(`[ENRICHMENT] Failed to fetch/parse raw CSV for "${name}":`, e);
    }

    if (!combinedCsvData) {
      // Fallback: Generate basic CSV if raw data fetch failed
      const fallbackRows = layer.pts.map(p => ({
        Latitude: p.lat,
        Longitude: p.lng,
        Tower_No: p.towerNo || '?',
        Joint_Box: p.jointBox || ''
      }));
      combinedCsvData = Papa.unparse(fallbackRows);
    }

    const csvName = `${safeBaseName}.csv`;
    dataFolder.file(csvName, combinedCsvData);

    const pointLayerId = `${safeBaseName}_towers`;
    const lineLayerId = `${safeBaseName}_line`;

    // ─── 1. TOWERS LAYER (Points) ───────────────────────────────────────
    iconsFolder.file("jb_4w.svg", getSvgText('4W', '#ff00ff'));
    iconsFolder.file("jb_3w.svg", getSvgText('3W', '#00ffff'));
    iconsFolder.file("jb_2w.svg", getSvgText('2W', '#fbbf24'));

    mapLayersXml.push(`
    <maplayer simplifyAlgorithm="0" type="vector" geometry="Point">
      <id>${escapeXml(pointLayerId)}</id>
      <datasource>file:./data/${csvName}?type=csv&amp;xField=Longitude&amp;yField=Latitude</datasource>
      <layername>${escapeXml(name)} (Towers)</layername>
      <crs>
        <spatialrefsys>
          <authid>EPSG:4326</authid>
        </spatialrefsys>
      </crs>
      <precision>8</precision>
      <simplifyDrawingHints>0</simplifyDrawingHints>
      <simplifyMaxScale>1</simplifyMaxScale>
      <simplifyLocal>1</simplifyLocal>
      <simplifyAlgorithm>0</simplifyAlgorithm>
      <provider encoding="UTF-8">delimitedtext</provider>
      <renderer-v2 type="RuleRenderer">
        <rules key="root">
          <rule filter="&quot;Joint_Box&quot; = '4W'" symbol="0" label="JB 4W"/>
          <rule filter="&quot;Joint_Box&quot; = '3W'" symbol="1" label="JB 3W"/>
          <rule filter="&quot;Joint_Box&quot; = '2W'" symbol="2" label="JB 2W"/>
          <rule filter="&quot;Joint_Box&quot; IS NULL OR &quot;Joint_Box&quot; = ''" symbol="3" label="Tower"/>
        </rules>
        <symbols>
          <symbol alpha="1" type="marker" name="0">
            <layer class="SvgMarker"><prop k="name" v="./icons/jb_4w.svg"/><prop k="size" v="6.0"/><prop k="outline_width" v="0.2"/></layer>
          </symbol>
          <symbol alpha="1" type="marker" name="1">
            <layer class="SvgMarker"><prop k="name" v="./icons/jb_3w.svg"/><prop k="size" v="6.0"/><prop k="outline_width" v="0.2"/></layer>
          </symbol>
          <symbol alpha="1" type="marker" name="2">
            <layer class="SvgMarker"><prop k="name" v="./icons/jb_2w.svg"/><prop k="size" v="6.0"/><prop k="outline_width" v="0.2"/></layer>
          </symbol>
          <symbol alpha="1" type="marker" name="3">
            <layer class="SimpleMarker"><prop k="name" v="circle"/><prop k="color" v="255,0,0,255"/><prop k="outline_color" v="255,255,255,255"/><prop k="size" v="1.8"/></layer>
          </symbol>
        </symbols>
      </renderer-v2>
      <labeling type="simple">
        <settings calloutType="simple">
          <text-style fontPointSize="7" fontName="Arial" fieldName="concat($id, '-', &quot;Tower_No&quot;, if(&quot;Joint_Box&quot; != '', concat('-', &quot;Joint_Box&quot;), ''))" isExpression="1" textColor="50,50,50,255">
            <text-buffer bufferSize="1.5" bufferDraw="1" bufferColor="255,255,255,255"/>
          </text-style>
          <placement placement="0" dist="1.5" quadOffset="2"/>
        </settings>
      </labeling>
    </maplayer>`);

    // ─── 2. DYNAMIC LINE LAYER (Path via Virtual Layer) ────────────────
    const vQuery = `SELECT MakeLine(MakePoint("Longitude", "Latitude")) AS geometry, '${lineLabel.replace(/'/g, "''")}' AS L FROM "${pointLayerId}"`;
    // URL encode the query because it's part of the datasource URI string
    const encodedVQuery = encodeURIComponent(vQuery);

    mapLayersXml.push(`
    <maplayer simplifyAlgorithm="0" type="vector" geometry="Line">
      <id>${escapeXml(lineLayerId)}</id>
      <datasource>?query=${escapeXml(encodedVQuery)}</datasource>
      <layername>${escapeXml(name)} (Path)</layername>
      <crs>
        <spatialrefsys>
          <authid>EPSG:4326</authid>
        </spatialrefsys>
      </crs>
      <precision>8</precision>
      <simplifyDrawingHints>0</simplifyDrawingHints>
      <simplifyMaxScale>1</simplifyMaxScale>
      <simplifyLocal>1</simplifyLocal>
      <simplifyAlgorithm>0</simplifyAlgorithm>
      <provider>virtual</provider>
      <renderer-v2 forceraster="0" type="singleSymbol">
        <symbols>
          <symbol alpha="1" type="line" name="0">
            <layer pass="0" class="SimpleLine" locked="0">
              <prop k="line_color" v="${hexToRgb(color)}"/>
              <prop k="line_width" v="0.7"/>
              <prop k="joinstyle" v="round"/>
              <prop k="capstyle" v="round"/>
            </layer>
          </symbol>
        </symbols>
      </renderer-v2>
      <labeling type="simple">
        <settings calloutType="simple">
          <text-style fontPointSize="8" fontName="Arial" fieldName="L" fontWeight="75" textColor="${hexToRgb(color)}">
            <text-buffer bufferSize="1.2" bufferDraw="1" bufferColor="255,255,255,255"/>
          </text-style>
          <placement placement="2" dist="2" offsetType="0" repeatDistance="0" placementFlags="9"/>
        </settings>
      </labeling>
    </maplayer>`);

    lotGroups[lotId].pathNodes.push(`      <layer-tree-layer id="${escapeXml(lineLayerId)}" name="${escapeXml(name)} (Path)" checked="Qt::Checked" expanded="0" providerKey="virtual" source="?query=${escapeXml(encodedVQuery)}"/>`);
    lotGroups[lotId].pointNodes.push(`      <layer-tree-layer id="${escapeXml(pointLayerId)}" name="${escapeXml(name)} (Towers)" checked="Qt::Checked" expanded="0" providerKey="delimitedtext" source="file:./data/${csvName}?type=csv&amp;xField=Longitude&amp;yField=Latitude"/>`);

    progressCounter++;
    if (onProgress) onProgress(Math.round((progressCounter / totalSteps) * 100));
  }

  // ─── 3. SUBSTATIONS ──────────────────────────────────────────────────
  try {
    const subStationRes = await fetch('/view/All%20Sub%20Station.csv');
    if (subStationRes.ok) {
      const subStationText = await subStationRes.text();
      dataFolder.file("All_Sub_Station.csv", subStationText);

      const rules = [];
      const symbols = [];
      let ruleIdx = 0;

      // Type Rules (HO, GENERATION)
      if (config && config.types) {
        Object.keys(config.types).forEach(typeKey => {
          const conf = config.types[typeKey];
          const color = hexToRgb(conf.color);
          let symbolTag = '';

          if (conf.shape && conf.shape.startsWith('<svg')) {
            const svgName = `ss_${typeKey.toLowerCase()}.svg`;
            // Inject the correct category color into the SVG if it uses a black fill
            const coloredSvg = conf.shape.replace(/fill="#000000"/g, `fill="${conf.color}"`);
            iconsFolder.file(svgName, coloredSvg);
            symbolTag = `<symbol alpha="1" type="marker" name="${ruleIdx}"><layer class="SvgMarker"><prop k="name" v="./icons/${svgName}"/><prop k="size" v="${(conf.baseSize || 12) / 3}"/><prop k="outline_width" v="0.2"/></layer></symbol>`;
          } else {
            const qgisShape = typeKey === 'HO' ? 'star' : 'hexagon';
            symbolTag = `<symbol alpha="1" type="marker" name="${ruleIdx}"><layer class="SimpleMarker"><prop k="name" v="${qgisShape}"/><prop k="color" v="${color}"/><prop k="outline_color" v="255,255,255,255"/><prop k="size" v="${(conf.baseSize || 12) / 3}"/></layer></symbol>`;
          }

          const filter = `upper("ss_type") = '${typeKey.toUpperCase()}'`;
          rules.unshift(`<rule filter="${escapeXml(filter)}" symbol="${ruleIdx}" label="${escapeXml(conf.name || typeKey)}"/>`);
          symbols.push(symbolTag);
          ruleIdx++;
        });
      }

      // Voltage Rules
      if (config && config.voltages) {
        config.voltages.forEach((v, idx) => {
          const color = hexToRgb(v.color);
          let symbolTag = '';

          if (v.shape && v.shape.startsWith('<svg')) {
            const svgName = `ss_volt_${v.class}.svg`;
            iconsFolder.file(svgName, v.shape);
            symbolTag = `<symbol alpha="1" type="marker" name="${ruleIdx}"><layer class="SvgMarker"><prop k="name" v="./icons/${svgName}"/><prop k="size" v="${(v.baseSize || 10) / 3}"/><prop k="outline_width" v="0.2"/></layer></symbol>`;
          } else {
            const qgisShape = v.shape === 'triangle' ? 'triangle' : v.shape === 'hexagon' ? 'hexagon' : v.shape === 'diamond' ? 'diamond' : v.shape === 'square' ? 'square' : 'circle';
            symbolTag = `<symbol alpha="1" type="marker" name="${ruleIdx}"><layer class="SimpleMarker"><prop k="name" v="${qgisShape}"/><prop k="color" v="${color}"/><prop k="outline_color" v="255,255,255,255"/><prop k="size" v="${(v.baseSize || 10) / 3}"/></layer></symbol>`;
          }

          let filter = idx === 0
            ? `to_int(left("volt_ratio", strpos("volt_ratio", '/')-1)) >= ${v.class}`
            : `to_int(left("volt_ratio", strpos("volt_ratio", '/')-1)) >= ${v.class} AND to_int(left("volt_ratio", strpos("volt_ratio", '/')-1)) < ${config.voltages[idx - 1].class}`;

          // Avoid overlap: Don't show voltage marker if a type marker (HO, GENERATION) is already showing
          if (config.types) {
            const typeKeys = Object.keys(config.types).map(k => `'${k.toUpperCase()}'`).join(', ');
            filter = `(${filter}) AND (upper("ss_type") NOT IN (${typeKeys}) OR "ss_type" IS NULL)`;
          }

          rules.push(`<rule filter="${escapeXml(filter)}" symbol="${ruleIdx}" label="${v.class}kV Substation"/>`);
          symbols.push(symbolTag);
          ruleIdx++;
        });
      }

      mapLayersXml.push(`
    <maplayer type="vector" geometry="Point">
      <id>all_sub_station</id>
      <datasource>file:./data/All_Sub_Station.csv?type=csv&amp;wktField=wkt_geom</datasource>
      <layername>All Sub Stations</layername>
      <srs>
        <spatialrefsys>
          <authid>EPSG:4326</authid>
        </spatialrefsys>
      </srs>
      <provider encoding="UTF-8">delimitedtext</provider>
      <renderer-v2 type="RuleRenderer">
        <rules key="root">${rules.join('\n')}</rules>
        <symbols>${symbols.join('\n')}</symbols>
      </renderer-v2>
      <labeling type="simple">
        <settings calloutType="simple">
          <text-style fontPointSize="9" fontName="Arial" fieldName="ss_name" fontWeight="75" textColor="30,30,80,255">
            <text-buffer bufferSize="1.2" bufferDraw="1" bufferColor="255,255,255,255"/>
          </text-style>
          <placement placement="0" dist="2" quadOffset="2"/>
        </settings>
      </labeling>
    </maplayer>`);
    }
  } catch (e) { }

  const layerTreeXml = Object.values(lotGroups).map(group => `
    <layer-tree-group name="${escapeXml(group.name)}" expanded="1">
      <layer-tree-group name="SURVEY PATHS" expanded="0">
          ${group.pathNodes.join('\n')}
      </layer-tree-group>
      <layer-tree-group name="TOWER POINTS" expanded="0">
          ${group.pointNodes.join('\n')}
      </layer-tree-group>
    </layer-tree-group>`).join('\n');

  const xml = `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis projectname="${escapeXml(projectName)}" version="3.40.4">
  <title>${escapeXml(projectName)}</title>
  <projectcrs>
    <authid>EPSG:4326</authid>
  </projectcrs>
  ${mapCanvasXml}
  <projectlayers>
    ${mapLayersXml.join('\n')}
  </projectlayers>
  <layer-tree-group>
    <customproperties/>
    <layer-tree-layer id="all_sub_station" name="All Sub Stations" checked="Qt::Checked" expanded="1" providerKey="delimitedtext" source="file:./data/All_Sub_Station.csv?type=csv&amp;wktField=wkt_geom"/>
    ${layerTreeXml}
  </layer-tree-group>
</qgis>`;

  zip.file(`${projectName}.qgs`, xml);
  const content = await zip.generateAsync({ type: "blob" });
  if (onProgress) onProgress(100);

  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = zipFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};


