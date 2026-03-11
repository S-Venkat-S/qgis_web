import React, { useState, useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import JSZip from 'jszip';

export const updatedLots = [
  { id: 'lot1', name: 'LOT 1', basePath: '/view/LOT_1/' },
  { id: 'lot2', name: 'LOT 2', basePath: '/view/LOT_2/' },
  { id: 'lot3', name: 'LOT 3', basePath: '/view/LOT_3_TNEB/' },
  { id: 'lot4', name: 'LOT 4', basePath: '/view/LOT_4/' }
];

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
    click: () => setPos(null),
    movestart: () => setPos(null)
  });

  const handleCopy = () => {
    if (!pos) return;
    const text = `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setPos(null), 1000);
  };

  if (!pos) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 10000,
        background: 'white',
        padding: '4px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        border: '1px solid #e2e8f0'
      }}
    >
      <button
        onClick={handleCopy}
        className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all whitespace-nowrap shadow-sm ${copied ? 'bg-green-600 text-white' : 'bg-primary-blue text-white hover:bg-blue-700'}`}
      >
        {copied ? '✓ COPIED!' : `COPY: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}`}
      </button>
    </div>
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

  // Group layers by their lot ID (e.g., 'lot1', 'lot2')
  const lotGroups = {};
  layers.forEach((layer) => {
    const { id, name, color } = layer;
    const lotId = id.split('_')[0]; // "lot1"

    if (!lotGroups[lotId]) {
      lotGroups[lotId] = { id: lotId, layers: [] };
    }
    lotGroups[lotId].layers.push(layer);
  });

  const zip = new JSZip();

  const mapLayersXml = [];
  const layerTreeXml = [];

  let progressCounter = 0;
  const totalSteps = layers.length + 3; // +3 for sub station, xml gen, and zip generation

  for (const lotId of Object.keys(lotGroups)) {
    const group = lotGroups[lotId];

    // Create a folder in zip for this lot
    const folder = zip.folder(lotId);

    // Get the base path for fetching the original CSV
    const lotDef = updatedLots.find(l => l.id === lotId);
    if (!lotDef) continue;

    // 1 group in QGIS tree per lot
    layerTreeXml.push(`    <layer-tree-group checked="Qt::Checked" expanded="1" name="${escapeXml(lotId.toUpperCase())}">`);
    layerTreeXml.push(`      <customproperties/>`);

    for (const layer of group.layers) {
      const { id, name, color } = layer;

      // Fetch the original CSV
      try {
        const fetchUrl = `${lotDef.basePath}${name}`;
        const res = await fetch(fetchUrl);
        if (res.ok) {
          const fileData = await res.text();
          folder.file(name, fileData); // save inside matching lot folder
        } else {
          console.warn("Could not fetch file:", fetchUrl);
          continue; // file not available, skip layer
        }
      } catch (e) {
        console.warn("Failed to fetch:", name, e);
        continue;
      }

      const safeId = escapeXml(`${id}`);

      // Calculate WKT payload exactly as earlier robust version
      const safeLayerName = name.replace(/"/g, '""');
      const wkt = `LINESTRING(${layer.pts.map(p => `${p.lng} ${p.lat}`).join(', ')})`;
      const qgisCsvFileName = `${name.replace(/\.[^/.]+$/, "")}_qgis.csv`;

      // Calculate custom label matching browser view logic
      const customLabel = name.split(' ')[1] || name.split(' ')[0];
      const safeCustomLabel = customLabel.replace(/"/g, '""');

      // Save this WKT-driven CSV alongside the raw file for QGIS use
      const qgisDataRow = `id,name,label,color,points_count,WKT\n"${safeId}","${safeLayerName}","${safeCustomLabel}","${color}","${layer.pts.length}","${wkt}"`;
      folder.file(qgisCsvFileName, qgisDataRow);

      const encName = escapeXml(qgisCsvFileName);

      // Create Map Layer XML targeting this specific WKT file
      mapLayersXml.push(`
    <maplayer simplifyAlgorithm="0" type="vector" geometry="Line">
      <id>${safeId}</id>
      <datasource>file:./${lotId}/${encName}?type=csv&amp;wktField=WKT</datasource>
      <layername>${escapeXml(name)}</layername>
      <provider encoding="UTF-8">delimitedtext</provider>
      <renderer-v2 forceraster="0" symbollevels="0" type="singleSymbol" enableorderby="0">
        <symbols>
          <symbol alpha="1" type="line" name="0">
            <layer pass="0" class="SimpleLine" locked="0">
              <prop k="line_color" v="${color}"/>
              <prop k="line_width" v="0.6"/>
              <prop k="line_style" v="solid"/>
              <prop k="capstyle" v="square"/>
              <prop k="joinstyle" v="bevel"/>
            </layer>
          </symbol>
        </symbols>
      </renderer-v2>
      <labeling type="simple">
        <settings calloutType="simple">
          <text-style fontPointSize="8" textColor="${hexToRgb(color)}" fontSize="8" fontWeight="75" fontName="Arial" fieldName="label">
            <text-buffer bufferSize="1.2" bufferDraw="1" bufferColor="255,255,255,255"/>
          </text-style>
          <placement placement="2" dist="1" repeatDistance="0" priority="5" offsetType="0" xOffset="0" yOffset="0"/>
        </settings>
      </labeling>
    </maplayer>`);

      layerTreeXml.push(`      <layer-tree-layer id="${safeId}" name="${escapeXml(name)}" checked="Qt::Checked" expanded="1" providerKey="delimitedtext" source="file:./${lotId}/${encName}?type=csv&amp;wktField=WKT"/>`);

      progressCounter++;
      if (onProgress) {
        onProgress(Math.round((progressCounter / totalSteps) * 100));
      }
    }

    layerTreeXml.push(`    </layer-tree-group>`);
  }

  // Fetch "All Sub Station.csv" dynamically
  try {
    const subStationRes = await fetch('/view/All%20Sub%20Station.csv');
    if (subStationRes.ok) {
      const subStationText = await subStationRes.text();
      zip.file("All_Sub_Station.csv", subStationText);

      mapLayersXml.push(`
      <maplayer simplifyAlgorithm="0" type="vector" geometry="Point">
        <id>all_sub_station</id>
        <datasource>file:./All_Sub_Station.csv?type=csv&amp;wktField=wkt_geom</datasource>
        <layername>All Sub Stations</layername>
        <provider encoding="UTF-8">delimitedtext</provider>
        <renderer-v2 type="singleSymbol" forceraster="0">
          <symbols>
            <symbol alpha="1" type="marker" name="0">
              <layer pass="0" class="SimpleMarker" locked="0">
                <prop k="name" v="circle"/>
                <prop k="color" v="20,184,166,255"/>
                <prop k="outline_color" v="255,255,255,255"/>
                <prop k="outline_width" v="0.6"/>
                <prop k="size" v="3.5"/>
                <prop k="style" v="solid"/>
              </layer>
            </symbol>
          </symbols>
        </renderer-v2>
        <labeling type="simple">
          <settings calloutType="simple">
            <text-style fontPointSize="9" textColor="20,184,166,255" fontSize="9" fontWeight="75" fontName="Arial" fieldName="ss_name">
              <text-buffer bufferSize="1" bufferDraw="1" bufferColor="255,255,255,255"/>
            </text-style>
            <placement placement="0" dist="2" quadOffset="2" repeatDistance="0"/>
          </settings>
        </labeling>
      </maplayer>`);

      layerTreeXml.push(`<layer-tree-layer id="all_sub_station" name="All Sub Stations" checked="Qt::Checked" expanded="1" providerKey="delimitedtext" source="file:./All_Sub_Station.csv?type=csv&amp;wktField=wkt_geom"/>`);
    }
  } catch (error) {
    console.warn("Could not fetch All Sub Station.csv for export.", error);
  }

  progressCounter++;
  if (onProgress) onProgress(Math.round((progressCounter / totalSteps) * 100));

  const xml = `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis projectname="${escapeXml(projectName)}" version="3.22.0">
  <homePath path=""/>
  <title>${escapeXml(projectName)}</title>
  <projectlayers>
    ${mapLayersXml.join('\n')}
  </projectlayers>
  <layer-tree-group>
    <customproperties/>
    ${layerTreeXml.join('\n    ')}
  </layer-tree-group>
</qgis>`;

  zip.file(`${projectName}.qgs`, xml);

  progressCounter++;
  if (onProgress) onProgress(Math.round((progressCounter / totalSteps) * 100));

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

