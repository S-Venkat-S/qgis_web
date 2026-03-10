import React, { useState, useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';

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

/**
 * Generates a QGIS .qgs project XML string and triggers download
 */
export const exportQGISProject = (layers, projectName = "survey_project") => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${projectName}_${timestamp}.qgs`;

  // Generate XML for each layer (Survey Lines)
  const layerSections = layers.map((layer, idx) => {
    const { id, name, pts, color } = layer;

    // Convert point data to GeoJSON for embedding
    const geojson = {
      type: "FeatureCollection",
      name: name,
      features: [{
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: pts.map(p => [p.lng, p.lat])
        },
        properties: {
          name: name,
          lot: id.split('_')[0],
          points: pts.length
        }
      }]
    };

    // Encode data into a URI that QGIS/GDAL can read directly from the project file
    const base64Data = btoa(JSON.stringify(geojson));
    const dataSource = `data:application/json;base64,${base64Data}`;

    return `
    <maplayer simplifyAlgorithm="0" minimumScale="0" maximumScale="1e+08" simplifyDrawingHints="1" readOnly="0" minLabelScale="0" maxLabelScale="1e+08" simplifyLocal="1" hasScaleBasedVisibilityFlag="0" simplifyMaxScale="1" type="vector" geometry="Line">
      <id>${id}_${idx}</id>
      <datasource>${dataSource}</datasource>
      <layername>${name}</layername>
      <provider encoding="UTF-8">ogr</provider>
      <renderer-v2 forceraster="0" symbollevels="0" type="singleSymbol" enableorderby="0">
        <symbols>
          <symbol alpha="1" clip_to_extent="1" type="line" name="0">
            <layer pass="0" class="SimpleLine" locked="0">
              <prop k="capstyle" v="square"/>
              <prop k="line_color" v="${color}"/>
              <prop k="line_style" v="solid"/>
              <prop k="line_width" v="0.6"/>
              <prop k="line_width_unit" v="MM"/>
              <prop k="joinstyle" v="bevel"/>
            </layer>
          </symbol>
        </symbols>
      </renderer-v2>
      <labeling type="simple">
        <settings calloutType="simple">
          <text-style fontItalic="0" fontLetterSpacing="0" fontPointSize="9" textColor="255,255,255,255" fontSize="9" fontWeight="75" fontName="Arial">
            <text-buffer bufferSize="1" bufferDraw="1" bufferColor="0,0,0,255"/>
          </text-style>
        </settings>
      </labeling>
    </maplayer>`;
  }).join("");

  const xml = `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis projectname="${projectName}" version="3.22.0">
  <homePath path=""/>
  <title>${projectName}</title>
  <projectCrs>
    <spatialrefsys>
      <wkt>GEOGCRS["WGS 84",ID["EPSG",4326]]</wkt>
      <authid>EPSG:4326</authid>
    </spatialrefsys>
  </projectCrs>
  <layer-tree-group>
    <customproperties/>
    ${layers.map((l, i) => `<layer-tree-layer id="${l.id}_${i}" name="${l.name}" checked="Qt::Checked" expanded="1" providerKey="ogr" source="data:application/json;base64,..."/>`).join("\n    ")}
  </layer-tree-group>
  <projectlayers>
    ${layerSections}
  </projectlayers>
</qgis>`;

  const blob = new Blob([xml], { type: 'application/x-qgis-project' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
