import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';
import { updatedLots, ChangeView, ZoomHandler, OPACITY_KEY, DEFAULT_OPACITY, SHOW_MAP_KEY, DEFAULT_SHOW_MAP, SHOW_SS_LABELS_KEY, DEFAULT_SS_LABELS, SHOW_LINE_LABELS_KEY, DEFAULT_LINE_LABELS, exportQGISProject } from './MapUtils';
import SubStationLayer from './SubStationLayer';

const SingleFileView = () => {
    const { lotId, fileName } = useParams();
    const navigate = useNavigate();

    const [points, setPoints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [bounds, setBounds] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(13);
    const [mapOpacity, setMapOpacity] = useState(() => {
        const saved = localStorage.getItem(OPACITY_KEY);
        return saved !== null ? parseFloat(saved) : DEFAULT_OPACITY;
    });
    const [showMap, setShowMap] = useState(() => {
        const saved = localStorage.getItem(SHOW_MAP_KEY);
        return saved !== null ? JSON.parse(saved) : DEFAULT_SHOW_MAP;
    });
    const [showSSLabels, setShowSSLabels] = useState(() => {
        const saved = localStorage.getItem(SHOW_SS_LABELS_KEY);
        return saved !== null ? JSON.parse(saved) : DEFAULT_SS_LABELS;
    });
    const [showTowerLabels, setShowTowerLabels] = useState(true);
    const [showDistLabels, setShowDistLabels] = useState(true);

    useEffect(() => {
        localStorage.setItem(OPACITY_KEY, mapOpacity);
    }, [mapOpacity]);

    useEffect(() => {
        localStorage.setItem(SHOW_MAP_KEY, JSON.stringify(showMap));
    }, [showMap]);

    useEffect(() => {
        localStorage.setItem(SHOW_SS_LABELS_KEY, JSON.stringify(showSSLabels));
    }, [showSSLabels]);

    useEffect(() => {
        const lot = updatedLots.find(l => l.id === lotId);
        if (!lot || !fileName) return;

        setLoading(true);
        const fileUrl = `${lot.basePath}${fileName}`;

        Papa.parse(fileUrl, {
            download: true,
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim(),
            complete: (results) => {
                const parsedPoints = results.data
                    .map(row => {
                        const latKey = Object.keys(row).find(k => k.toLowerCase() === 'latitude');
                        const lngKey = Object.keys(row).find(k => k.toLowerCase() === 'longitude');
                        const towerNoKey = Object.keys(row).find(k => ['tower no.', 'tower no', 's.no', 's.no.'].includes(k.toLowerCase()));

                        return {
                            lat: latKey ? parseFloat(row[latKey]) : NaN,
                            lng: lngKey ? parseFloat(row[lngKey]) : NaN,
                            towerNo: towerNoKey ? row[towerNoKey] : 'N/A',
                            description: row.Description
                        };
                    })
                    .filter(pt => !isNaN(pt.lat) && !isNaN(pt.lng));

                setPoints(parsedPoints);
                if (parsedPoints.length > 0) {
                    const polyBounds = L.latLngBounds(parsedPoints.map(p => [p.lat, p.lng]));
                    setBounds(polyBounds);
                }
                setLoading(false);
            },
            error: (err) => {
                console.error("Single file parse error:", err);
                setLoading(false);
            }
        });
    }, [lotId, fileName]);

    const handleExport = () => {
        if (points.length === 0) return;
        const color = lotId === 'lot1' ? '#6366F1' : lotId === 'lot2' ? '#34D399' : lotId === 'lot3' ? '#FBBF24' : '#F87171';
        exportQGISProject([{ id: fileName, name: fileName, pts: points, color }], fileName.split('.')[0]);
    };

    const handleBack = () => navigate('/live');

    if (loading) {
        return (
            <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-blue"></div>
                <p className="mt-4 text-sm font-medium text-gray-500">Loading {fileName}...</p>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
            <div className="bg-white p-3 shadow-md z-[1001] flex items-center justify-between border-b">
                <div className="flex items-center">
                    <button onClick={handleBack} className="mr-3 p-2 rounded-full hover:bg-gray-100 transition-colors">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <div>
                        <h2 className="text-sm font-bold truncate max-w-[200px] md:max-w-md">{fileName}</h2>
                        <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">{lotId.toUpperCase()}</span>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-5 border-r pr-6 border-gray-100">
                        <div className="flex items-center gap-2 cursor-pointer select-none group" title="Toggle Map Tiles" onClick={() => setShowMap(!showMap)}>
                            <div className={`w-8 h-4 rounded-full relative transition-all duration-200 ${showMap ? 'bg-primary-blue' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showMap ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 group-hover:text-primary-blue transition-colors uppercase">MAP</span>
                        </div>

                        <div className="flex items-center gap-2 cursor-pointer select-none group" title="Toggle Tower Labels" onClick={() => setShowTowerLabels(!showTowerLabels)}>
                            <div className={`w-8 h-4 rounded-full relative transition-all duration-200 ${showTowerLabels ? 'bg-rose-500' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showTowerLabels ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 group-hover:text-rose-500 transition-colors uppercase">TOWERS</span>
                        </div>

                        <div className="flex items-center gap-2 cursor-pointer select-none group" title="Toggle Distance Labels" onClick={() => setShowDistLabels(!showDistLabels)}>
                            <div className={`w-8 h-4 rounded-full relative transition-all duration-200 ${showDistLabels ? 'bg-yellow-500' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showDistLabels ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 group-hover:text-yellow-600 transition-colors uppercase">DIST</span>
                        </div>

                        <div className="flex items-center gap-2 cursor-pointer select-none group" title="Toggle Sub-Station Labels" onClick={() => setShowSSLabels(!showSSLabels)}>
                            <div className={`w-8 h-4 rounded-full relative transition-all duration-200 ${showSSLabels ? 'bg-amber-500' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showSSLabels ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 group-hover:text-amber-500 transition-colors uppercase">STATIONS</span>
                        </div>
                    </div>

                    <button
                        onClick={handleExport}
                        disabled={points.length === 0}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-full text-[10px] font-bold transition-all shadow-sm flex items-center gap-2 uppercase tracking-tight"
                    >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export QGIS
                    </button>
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter mb-0.5">Map Opacity</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={mapOpacity}
                            onChange={e => setMapOpacity(parseFloat(e.target.value))}
                            className="w-24 accent-primary-blue h-1 cursor-pointer bg-gray-200 rounded-lg appearance-none"
                        />
                    </div>
                </div>
            </div>

            <div className="flex-grow bg-gray-900 relative">
                <MapContainer
                    center={[11.0, 77.0]}
                    zoom={13}
                    bounds={bounds}
                    preferCanvas={true}
                    className="h-full w-full bg-gray-900"
                >
                    <ChangeView bounds={bounds} />
                    <ZoomHandler onZoom={setZoomLevel} />
                    {showMap && (
                        <TileLayer
                            url="http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}"
                            maxZoom={22}
                            opacity={mapOpacity}
                            subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                            attribution='&copy; Google Maps'
                        />
                    )}

                    <SubStationLayer showLabels={showSSLabels} />

                    {points.length > 0 && (
                        <>
                            <Polyline
                                positions={points.map(p => [p.lat, p.lng])}
                                color="#FFD700"
                                weight={5}
                                opacity={1} // Ensuring drawn line is always fully opaque (relative to its own path)
                            />
                            {points.map((pt, idx) => {
                                const nextPt = points[idx + 1];
                                let distance = null;
                                let midpoint = null;

                                if (nextPt) {
                                    const p1 = L.latLng(pt.lat, pt.lng);
                                    const p2 = L.latLng(nextPt.lat, nextPt.lng);
                                    distance = Math.round(p1.distanceTo(p2));
                                    midpoint = [(pt.lat + nextPt.lat) / 2, (pt.lng + nextPt.lng) / 2];
                                }

                                return (
                                    <React.Fragment key={idx}>
                                        <CircleMarker
                                            center={[pt.lat, pt.lng]}
                                            radius={4}
                                            pathOptions={{
                                                color: 'red',
                                                fillColor: '#f03',
                                                fillOpacity: 1,
                                                weight: 1
                                            }}
                                        >
                                            <Popup>
                                                <div className="text-xs text-black min-w-[120px]">
                                                    <strong className="block border-b mb-1 pb-1">{fileName}</strong>
                                                    <span className="block font-bold mt-1">Tower: {pt.towerNo}</span>
                                                    <span className="block font-mono text-[10px] opacity-70 mb-1">{pt.lat}, {pt.lng}</span>
                                                </div>
                                            </Popup>
                                            {showTowerLabels && zoomLevel >= 16 && (
                                                <Tooltip permanent direction="top">
                                                    {pt.towerNo}
                                                </Tooltip>
                                            )}
                                        </CircleMarker>

                                        {midpoint && showDistLabels && zoomLevel >= 15 && (
                                            <CircleMarker
                                                center={midpoint}
                                                radius={0}
                                                pathOptions={{ opacity: 0, fillOpacity: 0 }}
                                            >
                                                <Tooltip permanent direction="center">
                                                    {distance}
                                                </Tooltip>
                                            </CircleMarker>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </>
                    )}
                </MapContainer>
            </div>
        </div>
    );
};

export default SingleFileView;
