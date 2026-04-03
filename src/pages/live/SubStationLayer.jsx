import React, { useState, useEffect } from 'react';
import { Marker, Tooltip, useMap, useMapEvents, Popup } from 'react-leaflet';
import L from 'leaflet';
import Papa from 'papaparse';

const SubStationLayer = ({ showLabels = true }) => {
    const [subStations, setSubStations] = useState([]);
    const [zoomLevel, setZoomLevel] = useState(13);
    const [config, setConfig] = useState(null);
    const map = useMap();

    const [visibleStations, setVisibleStations] = useState([]);

    // Track zoom and viewport for dynamic styling/filtering
    const updateVisibleStations = () => {
        const currentZoom = map.getZoom();
        setZoomLevel(currentZoom);

        if (subStations.length === 0) return;

        const bounds = map.getBounds();
        const filtered = subStations.filter(ss => {
            const isVisible = bounds.contains([ss.lat, ss.lng]);
            if (!isVisible) return false;

            // Use config for culling if available
            if (config) {
                const conf = getSSConfig(ss);
                return currentZoom >= (conf.minZoom || 0);
            }

            // Fallback Culling
            const v = ss.voltClass;
            if (currentZoom < 8) return v >= 400 || ss.type === 'HO';
            if (currentZoom < 10) return v >= 230 || ss.type === 'HO';
            if (currentZoom < 12) return v >= 110 || ss.type === 'HO';
            return true;
        });

        setVisibleStations(filtered);
    };

    useMapEvents({
        zoomend: updateVisibleStations,
        moveend: updateVisibleStations
    });

    useEffect(() => {
        // Load Config
        fetch('/substation_config.json')
            .then(res => res.json())
            .then(data => setConfig(data))
            .catch(err => console.error("Error loading substation config:", err));

        const csvPath = '/view/All Sub Station.csv';

        Papa.parse(csvPath, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const parsed = results.data.map(row => {
                    const wkt = row.wkt_geom || '';
                    // Fix: Space after Point is optional in some rows
                    const match = wkt.match(/Point\s?\(([^ ]+) ([^ ]+)\)/i);
                    if (match) {
                        const voltStr = row.volt_ratio || '';
                        const voltClass = parseInt(voltStr.split('/')[0]) || 0;
                        return {
                            name: row.ss_name || row.name || 'Unknown',
                            lat: parseFloat(match[2]),
                            lng: parseFloat(match[1]),
                            volt: voltStr,
                            voltClass,
                            type: row.ss_type,
                            code: row.ss_code,
                            circle: row.cir_name
                        };
                    }
                    return null;
                }).filter(s => s !== null);
                setSubStations(parsed);
            },
            error: (err) => console.error("Error loading sub stations:", err)
        });
    }, []);

    useEffect(() => {
        updateVisibleStations();
    }, [subStations, config]);

    // Helper to get configuration for a specific substation
    const getSSConfig = (ss) => {
        if (!config) return { color: '#374151', shape: 'triangle', baseSize: 8 };

        // 1. Check type (Case insensitive)
        const typeKey = Object.keys(config.types || {}).find(t => t.toUpperCase() === (ss.type || '').toUpperCase());
        if (typeKey) return { ...config.default, ...config.types[typeKey] };

        // 2. Check voltage
        const voltConf = (config.voltages || []).find(v => ss.voltClass >= v.class);
        if (voltConf) return { ...config.default, ...voltConf };

        return config.default || { color: '#374151', shape: 'triangle', baseSize: 8 };
    };

    const getVoltColor = (ss) => {
        return getSSConfig(ss).color;
    };

    const createSSIcon = (ss, zoom) => {
        const conf = getSSConfig(ss);
        const color = conf.color;
        const shape = conf.shape || 'triangle';
        const baseSize = conf.baseSize || 8;

        // Scale size by zoom (optimized for SVG clarity)
        let scale = 1;
        if (zoom >= 18) scale = 2.5;
        else if (zoom >= 15) scale = 1.8;
        else if (zoom >= 13) scale = 1.2;
        else if (zoom < 10) scale = 0.8;

        const size = baseSize * scale;
        const strokeWidth = 1.5;

        // Check if shape is a custom SVG string
        if (shape.trim().startsWith('<svg')) {
            // Inject color into the custom SVG and ensure it fills the container
            const processedSvg = shape
                .replace(/fill="[^"]*"/g, `fill="${color}"`)
                .replace(/width="[^"]*"/g, 'width="100%"')
                .replace(/height="[^"]*"/g, 'height="100%"');

            const html = `
                <div style="width: ${size}px; height: ${size}px; filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.4)); display: flex; align-items: center; justify-content: center;">
                    ${processedSvg}
                </div>
            `;
            return L.divIcon({
                html,
                className: 'custom-ss-svg-icon',
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
                popupAnchor: [0, -size / 2]
            });
        }

        let svgContent = "";

        // Premium SVG Templates
        if (shape === 'star') {
            // Star for HO
            svgContent = `<polygon points="50,5 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35" fill="${color}" stroke="white" stroke-width="${strokeWidth * 2}" />`;
        } else if (shape === 'hexagon') {
            // Hexagon for Generation/765kV
            svgContent = `<polygon points="25,5 75,5 100,50 75,95 25,95 0,50" fill="${color}" stroke="white" stroke-width="${strokeWidth * 2}" />`;
        } else if (shape === 'diamond') {
            // Diamond for Grid/400kV
            svgContent = `<polygon points="50,5 95,50 50,95 5,50" fill="${color}" stroke="white" stroke-width="${strokeWidth * 2}" />`;
        } else if (shape === 'square') {
            // Rounded Square / Shield for 230kV
            svgContent = `<rect x="10" y="10" width="80" height="80" rx="15" fill="${color}" stroke="white" stroke-width="${strokeWidth * 2}" />`;
        } else if (shape === 'circle') {
            // Circle for Non-Grid/110kV
            svgContent = `<circle cx="50" cy="50" r="40" fill="${color}" stroke="white" stroke-width="${strokeWidth * 2}" />`;
        } else {
            // Triangle for minor
            svgContent = `<polygon points="50,10 90,90 10,90" fill="${color}" stroke="white" stroke-width="${strokeWidth * 2}" />`;
        }

        const html = `
            <svg viewBox="0 0 100 100" width="${size}" height="${size}" style="filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.4)); display: block;">
                ${svgContent}
            </svg>
        `;

        return L.divIcon({
            html,
            className: 'custom-ss-svg-icon',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            popupAnchor: [0, -size / 2]
        });
    };

    return (
        <React.Fragment>
            {visibleStations.map((ss, idx) => (
                <Marker
                    key={`ss-${idx}`}
                    position={[ss.lat, ss.lng]}
                    icon={createSSIcon(ss, zoomLevel)}
                >
                    <Popup>
                        <div className="text-[11px] p-1 min-w-[150px]">
                            <div className="flex items-center gap-2 border-b mb-2 pb-1">
                                <div className="w-2.5 h-2.5 rotate-45" style={{ backgroundColor: getVoltColor(ss), border: '1px solid white' }}></div>
                                <h3 className="font-extrabold text-gray-800 uppercase leading-tight">{ss.name}</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2">
                                <span className="text-gray-400 font-black uppercase text-[8px] tracking-wider">Voltage</span>
                                <span className="font-mono text-primary-blue font-bold px-1 py-0.5 rounded border border-blue-100 bg-blue-50/50">{ss.volt}</span>

                                <span className="text-gray-400 font-black uppercase text-[8px] tracking-wider">Type</span>
                                <span className="text-gray-700 font-semibold">{ss.type}</span>

                                <span className="text-gray-400 font-black uppercase text-[8px] tracking-wider">Asset Code</span>
                                <span className="font-mono text-gray-700">{ss.code}</span>

                                <span className="text-gray-400 font-black uppercase text-[8px] tracking-wider">Circle</span>
                                <span className="text-gray-700">{ss.circle}</span>
                            </div>
                        </div>
                    </Popup>
                    {showLabels && zoomLevel >= 10 && (
                        <Tooltip
                            permanent
                            direction="top"
                            offset={[0, -12]}
                            className="ss-tooltip-label"
                        >
                            {ss.name}
                        </Tooltip>
                    )}
                </Marker>
            ))}
            <style dangerouslySetInnerHTML={{
                __html: `
                .ss-tooltip-label {
                    background: transparent !important;
                    border: none !important;
                    box-shadow: none !important;
                    font-size: 9px !important;
                    font-weight: 800 !important;
                    color: #1e40af !important;
                    text-shadow: 1px 1px 0px white, -1px -1px 0px white, 1px -1px 0px white, -1px 1px 0px white !important;
                    padding: 0 !important;
                    pointer-events: none;
                    text-transform: uppercase;
                }
                .line-tooltip-label {
                    background: rgba(255, 255, 255, 0.8) !important;
                    border: 1px solid rgba(0, 0, 0, 0.1) !important;
                    border-radius: 4px !important;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2) !important;
                    font-size: 10px !important;
                    font-weight: 800 !important;
                    color: #1e293b !important;
                    padding: 2px 6px !important;
                    pointer-events: none;
                    text-transform: uppercase;
                }
                .leaflet-tooltip-top:before, .leaflet-tooltip-bottom:before, .leaflet-tooltip-left:before, .leaflet-tooltip-right:before { 
                    display: none !important; 
                }
            `}} />
        </React.Fragment>
    );
};

export default SubStationLayer;
