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

// Centralized CSV coordinate/tower extraction logic
export const extractPointsFromCSV = (data) => {
  if (!Array.isArray(data)) return [];
  return data.map(row => {
    const keys = Object.keys(row);
    const latKey = keys.find(k => {
      const low = k.toLowerCase().replace(/[^a-z]/g, '');
      return low === 'latitude' || low === 'lat';
    });
    const lngKey = keys.find(k => {
      const low = k.toLowerCase().replace(/[^a-z]/g, '');
      return low === 'longitude' || low === 'lng' || low === 'long' || low === 'lon';
    });
    const towerNoKey = keys.find(k => {
      const low = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      return ['towerno', 'tno', 'sno', 'sn'].includes(low);
    });

    const lat = latKey ? parseFloat(row[latKey]) : NaN;
    const lng = lngKey ? parseFloat(row[lngKey]) : NaN;

    return {
      lat,
      lng,
      towerNo: towerNoKey ? row[towerNoKey] : (row['Tower No.'] || 'N/A'),
      description: row.Description || row.description
    };
  }).filter(pt => !isNaN(pt.lat) && !isNaN(pt.lng));
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
  { id: 'glease1', name: 'G LEASE 1', basePath: '/view/G_LEASE_1/', color: '#8B5CF6' },
  { id: 'glease2', name: 'G LEASE 2', basePath: '/view/G_LEASE_2/', color: '#EC4899' },
  { id: 'existing', name: 'Existing', basePath: '/view/EXISTING/', color: '#6B7280' },
  { id: 'root', name: 'Global Assets', basePath: '/view/', color: '#D97706' }
];


export const APP_VERSION = packageJson.version;

// Helper to fit map bounds dynamically
export const ChangeView = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50], animate: true });
    }
  }, [bounds, map]);
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
    } catch (err) {}
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
  if (!hex || !hex.startsWith('#') || hex.length !== 7) return '0,0,0,255';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b},255`;
};

/**
 * Generates a QGIS .qgs project XML string and triggers download
 */
export const exportQGISProject = async (layers, projectName = "survey_project", onProgress) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const zipFileName = `${projectName}_${timestamp}.zip`;

  // Fetch config to mirror symbology
  let config = null;
  try {
    const resp = await fetch('/substation_config.json');
    if (resp.ok) config = await resp.json();
  } catch (e) { console.warn("Symbology config not found, using fallbacks."); }

  const zip = new JSZip();
  const mapLayersXml = [];

  // Tree Nodes
  const lotGroups = {};
  let progressCounter = 0;
  const totalLayers = layers.length;
  const totalSteps = totalLayers * 2 + 5;

  const dataFolder = zip.folder("data");

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

    try {
      const fetchUrl = lotDef.basePath ? `${lotDef.basePath}${name}` : null;
      if (fetchUrl) {
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const fileData = await res.text();
          dataFolder.file(`${safeBaseName}_raw.csv`, fileData);
        }
      }
    } catch (e) { }

    // ─── 1. LINE LAYER (Path) ──────────────────────────────────────────
    const lineLayerId = `${safeBaseName}_line`;
    const lineWkt = `LINESTRING(${layer.pts.map(p => `${p.lng} ${p.lat}`).join(', ')})`;
    const lineCsvName = `${safeBaseName}_path.csv`;
    const lineLabel = name.split(' ')[1] || name.split(' ')[0];

    dataFolder.file(lineCsvName, `id,WKT,label\n"${id}","${lineWkt}","${lineLabel}"`);

    mapLayersXml.push(`
    <maplayer simplifyAlgorithm="0" type="vector" geometry="Line">
      <id>${escapeXml(lineLayerId)}</id>
      <datasource>file:./data/${lineCsvName}?type=csv&amp;wktField=WKT</datasource>
      <layername>${escapeXml(name)} (Path)</layername>
      <provider encoding="UTF-8">delimitedtext</provider>
      <renderer-v2 forceraster="0" type="singleSymbol">
        <symbols>
          <symbol alpha="1" type="line" name="0">
            <layer pass="0" class="SimpleLine" locked="0">
              <prop k="line_color" v="${color}"/>
              <prop k="line_width" v="0.7"/>
              <prop k="joinstyle" v="round"/>
            </layer>
          </symbol>
        </symbols>
      </renderer-v2>
      <labeling type="simple">
        <settings calloutType="simple">
          <text-style fontPointSize="8" fontName="Arial" fieldName="label" fontWeight="75" textColor="${hexToRgb(color)}">
            <text-buffer bufferSize="1" bufferDraw="1" bufferColor="255,255,255,255"/>
          </text-style>
          <placement placement="2" dist="1.5" placementFlags="9"/>
        </settings>
      </labeling>
    </maplayer>`);

    // ─── 2. TOWERS LAYER (Points) ───────────────────────────────────────
    const pointLayerId = `${safeBaseName}_towers`;
    const pointCsvName = `${safeBaseName}_towers.csv`;
    const pointRows = ["tower_no,lat,lng,WKT"];
    layer.pts.forEach(p => {
      // Include even if towerNo is missing to avoid "Data source error" for empty CSVs
      pointRows.push(`"${p.towerNo || ''}",${p.lat},${p.lng},"POINT(${p.lng} ${p.lat})"`);
    });
    dataFolder.file(pointCsvName, pointRows.join("\n"));

    mapLayersXml.push(`
    <maplayer simplifyAlgorithm="0" type="vector" geometry="Point">
      <id>${escapeXml(pointLayerId)}</id>
      <datasource>file:./data/${pointCsvName}?type=csv&amp;wktField=WKT</datasource>
      <layername>${escapeXml(name)} (Towers)</layername>
      <provider encoding="UTF-8">delimitedtext</provider>
      <renderer-v2 type="singleSymbol">
        <symbols>
          <symbol alpha="1" type="marker" name="0">
            <layer pass="0" class="SimpleMarker" locked="0">
              <prop k="name" v="circle"/>
              <prop k="color" v="255,0,0,255"/>
              <prop k="outline_color" v="255,255,255,255"/>
              <prop k="size" v="1.8"/>
            </layer>
          </symbol>
        </symbols>
      </renderer-v2>
      <labeling type="simple">
        <settings calloutType="simple">
          <text-style fontPointSize="7" fontName="Arial" fieldName="tower_no" textColor="50,50,50,255">
            <text-buffer bufferSize="0.8" bufferDraw="1" bufferColor="255,255,255,255"/>
          </text-style>
          <placement placement="0" dist="1.5" quadOffset="2"/>
        </settings>
      </labeling>
    </maplayer>`);

    lotGroups[lotId].pathNodes.push(`      <layer-tree-layer id="${escapeXml(lineLayerId)}" name="${escapeXml(name)} (Path)" checked="Qt::Checked" expanded="0" providerKey="delimitedtext" source="file:./data/${escapeXml(lineCsvName)}?type=csv&amp;wktField=WKT"/>`);
    lotGroups[lotId].pointNodes.push(`      <layer-tree-layer id="${escapeXml(pointLayerId)}" name="${escapeXml(name)} (Towers)" checked="Qt::Checked" expanded="0" providerKey="delimitedtext" source="file:./data/${escapeXml(pointCsvName)}?type=csv&amp;wktField=WKT"/>`);

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
          const qgisShape = typeKey === 'HO' ? 'star' : 'hexagon';
          const color = hexToRgb(conf.color);
          const filter = `upper("ss_type") = '${typeKey.toUpperCase()}'`;
          rules.unshift(`<rule filter="${escapeXml(filter)}" symbol="${ruleIdx}" label="${escapeXml(conf.name || typeKey)}"/>`);
          symbols.push(`<symbol alpha="1" type="marker" name="${ruleIdx}"><layer class="SimpleMarker"><prop k="name" v="${qgisShape}"/><prop k="color" v="${color}"/><prop k="size" v="${(conf.baseSize || 12) / 3}"/></layer></symbol>`);
          ruleIdx++;
        });
      }

      // Voltage Rules
      if (config && config.voltages) {
        config.voltages.forEach((v, idx) => {
          const qgisShape = v.shape === 'triangle' ? 'triangle' : v.shape === 'hexagon' ? 'hexagon' : v.shape === 'diamond' ? 'diamond' : v.shape === 'square' ? 'square' : 'circle';
          const color = hexToRgb(v.color);
          const filter = idx === 0
            ? `to_int(left("volt_ratio", strpos("volt_ratio", '/')-1)) >= ${v.class}`
            : `to_int(left("volt_ratio", strpos("volt_ratio", '/')-1)) >= ${v.class} AND to_int(left("volt_ratio", strpos("volt_ratio", '/')-1)) < ${config.voltages[idx - 1].class}`;

          rules.push(`<rule filter="${escapeXml(filter)}" symbol="${ruleIdx}" label="${v.class}kV Substation"/>`);
          symbols.push(`<symbol alpha="1" type="marker" name="${ruleIdx}"><layer class="SimpleMarker"><prop k="name" v="${qgisShape}"/><prop k="color" v="${color}"/><prop k="outline_color" v="255,255,255,255"/><prop k="size" v="${(v.baseSize || 10) / 3}"/></layer></symbol>`);
          ruleIdx++;
        });
      }

      mapLayersXml.push(`
    <maplayer type="vector" geometry="Point">
      <id>all_sub_station</id>
      <datasource>file:./data/All_Sub_Station.csv?type=csv&amp;wktField=wkt_geom</datasource>
      <layername>All Sub Stations</layername>
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
<qgis projectname="${escapeXml(projectName)}" version="3.22.0">
  <title>${escapeXml(projectName)}</title>
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


