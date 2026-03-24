import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';
import { updatedLots, ChangeView, ZoomHandler, CopyCoordsHandler, OPACITY_KEY, DEFAULT_OPACITY, SHOW_MAP_KEY, DEFAULT_SHOW_MAP, SHOW_SS_LABELS_KEY, DEFAULT_SS_LABELS, SHOW_LINE_LABELS_KEY, DEFAULT_LINE_LABELS, exportQGISProject, parseCoords, getCoordinateFromParams } from './MapUtils';
import SubStationLayer from './SubStationLayer';

const SingleFileView = () => {
    const { lotId, fileName } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [exportProgress, setExportProgress] = useState(null);
    const [points, setPoints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [bounds, setBounds] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(13);
    const [searchQuery, setSearchQuery] = useState("");
    const [subStations, setSubStations] = useState([]);
    const [lotFiles, setLotFiles] = useState({});
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
        document.title = fileName || "Map Viewer";
        localStorage.setItem(OPACITY_KEY, mapOpacity);
    }, [mapOpacity, fileName]);

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
                        const keys = Object.keys(row);
                        const latKey = keys.find(k => {
                            const low = k.toLowerCase().replace(/[^a-z]/g, '');
                            return low === 'latitude' || low === 'lat';
                        });
                        const lngKey = keys.find(k => {
                            const low = k.toLowerCase().replace(/[^a-z]/g, '');
                            return low === 'longitude' || low === 'lng' || low === 'long';
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
                    })
                    .filter(pt => !isNaN(pt.lat) && !isNaN(pt.lng));

                if (parsedPoints.length === 0 && results.data.length > 0) {
                    console.error("No valid coordinates found in file. Columns found:", Object.keys(results.data[0]));
                    setError(`No valid coordinates found in ${fileName}. Checked for Latitude/Longitude columns.`);
                } else if (parsedPoints.length === 0) {
                    setError(`File ${fileName} appears to be empty or invalid CSV.`);
                }

                setPoints(parsedPoints);

                // Set bounds only if not already set by query params
                const qCoord = getCoordinateFromParams(searchParams);
                if (!qCoord && parsedPoints.length > 0) {
                    const polyBounds = L.latLngBounds(parsedPoints.map(p => [p.lat, p.lng]));
                    setBounds(polyBounds);
                }
                setLoading(false);
            },
            error: (err) => {
                console.error("Single file parse error:", err);
                setError(`Failed to load file: ${err.message || 'Unknown error'}`);
                setLoading(false);
            }
        });
    }, [lotId, fileName, searchParams]);

    // Load Index files and Substations for search
    useEffect(() => {
        updatedLots.forEach(lot => {
            fetch(`${lot.basePath}index.txt?${Date.now()}`)
                .then(r => r.text())
                .then(text => {
                    const files = text.split('\n')
                        .map(l => l.trim())
                        .filter(l => l.length > 0 && l.toLowerCase().endsWith('.csv'))
                        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
                    setLotFiles(prev => ({ ...prev, [lot.id]: files }));
                });
        });

        Papa.parse('/view/All Sub Station.csv', {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const parsed = results.data.map(row => {
                    const wkt = row.wkt_geom || '';
                    const match = wkt.match(/Point\s?\(([^ ]+) ([^ ]+)\)/i);
                    return match ? {
                        name: row.ss_name || row.name || 'Unknown',
                        lat: parseFloat(match[2]),
                        lng: parseFloat(match[1]),
                        type: row.ss_type || 'substation',
                        volt: row.volt_ratio
                    } : null;
                }).filter(s => s !== null);
                setSubStations(parsed);
            }
        });
    }, []);

    const searchResults = React.useMemo(() => {
        const query = searchQuery.trim();
        if (!query) return [];

        const results = [];

        // 1. Check if it's a coordinate pair
        const coords = parseCoords(query);
        if (coords) {
            results.push({ type: 'coord', lat: coords.lat, lng: coords.lng, name: `Go to: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` });
        }

        // 2. Search Survey Lines
        Object.entries(lotFiles).forEach(([lid, files]) => {
            files.forEach(fName => {
                if (fName.toLowerCase().includes(query.toLowerCase())) {
                    results.push({ type: 'line', lid, fName, name: fName });
                }
            });
        });

        // 3. Search Substations
        subStations.forEach(ss => {
            if (ss.name.toLowerCase().includes(query.toLowerCase())) {
                results.push({ type: 'ss', lat: ss.lat, lng: ss.lng, name: ss.name, volt: ss.volt, category: ss.type });
            }
        });

        return results.slice(0, 50);
    }, [searchQuery, lotFiles, subStations]);

    const handleSearchResultClick = (res) => {
        if (res.type === 'line') {
            if (res.lid === lotId && res.fName === fileName) {
                // If it's the current file, just re-zoom to it
                const polyBounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
                setBounds(polyBounds);
            } else {
                // Navigate to other file
                navigate(`/live/${res.lid}/${res.fName}`);
            }
            setSearchQuery("");
        } else if (res.type === 'coord' || res.type === 'ss') {
            const b = L.latLngBounds([[res.lat - 0.005, res.lng - 0.005], [res.lat + 0.005, res.lng + 0.005]]);
            setBounds(b);
            setSearchQuery("");
        }
    };

    // Handle initial coord jump
    useEffect(() => {
        const qCoord = getCoordinateFromParams(searchParams);
        if (qCoord) {
            const b = L.latLngBounds([
                [qCoord.lat - 0.002, qCoord.lng - 0.002],
                [qCoord.lat + 0.002, qCoord.lng + 0.002]
            ]);
            setBounds(b);
        }
    }, [searchParams]);

    const handleExport = async () => {
        if (points.length === 0) return;
        setExportProgress(0);
        const lot = updatedLots.find(l => l.id === lotId);
        const color = lot ? lot.color : '#FFD700';
        try {
            await exportQGISProject([{ id: fileName, name: fileName, pts: points, color }], fileName.split('.')[0], setExportProgress);
        } catch (e) {
            console.error("Export error:", e);
        } finally {
            setExportProgress(null);
        }
    };

    const handleBack = () => navigate('/live');

    if (error) {
        return (
            <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
                <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2 uppercase tracking-tight">Mapping Error</h3>
                <p className="max-w-md text-sm text-gray-500 font-medium mb-6 leading-relaxed">{error}</p>
                <button onClick={handleBack} className="px-6 py-2.5 bg-primary-blue text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Return to Dashboard
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-blue"></div>
                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-primary-blue/60">Synchronizing Map Data...</p>
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
                    <div className="mr-6 border-r pr-6 border-gray-100">
                        <h2 className="text-sm font-bold truncate max-w-[200px] md:max-w-md">{fileName}</h2>
                        <span className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">{lotId.toUpperCase()}</span>
                    </div>

                    {/* Global Search Interface */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Find Station, Coords or Line..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 pr-4 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-blue/20 w-64 transition-all"
                        />
                        <svg className="w-3.5 h-3.5 absolute left-2.5 top-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>

                        {searchResults.length > 0 && (
                            <div className="absolute top-full left-0 mt-2 w-72 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-[2000] no-scrollbar">
                                <div className="p-2 border-b bg-gray-50 uppercase text-[9px] font-bold text-gray-400 sticky top-0">Search Results ({searchResults.length})</div>
                                {searchResults.map((res, i) => (
                                    <div
                                        key={i}
                                        onClick={() => handleSearchResultClick(res)}
                                        className="p-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${res.type === 'line' ? 'bg-blue-100 text-blue-600' :
                                                res.type === 'ss' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                                                }`}>
                                                {res.type === 'line' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                                                {res.type === 'ss' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                                                {res.type === 'coord' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                                            </div>
                                            <div className="min-w-0 flex-grow">
                                                <div className="text-[11px] font-bold text-gray-700 group-hover:text-primary-blue transition-colors truncate uppercase tracking-tight">{res.name}</div>
                                                <div className="text-[9px] text-gray-400 font-medium truncate">
                                                    {res.type === 'line' && `${res.lid.toUpperCase()}`}
                                                    {res.type === 'ss' && `${res.volt || res.category || 'Substation'} • ${res.lat.toFixed(4)}, ${res.lng.toFixed(4)}`}
                                                    {res.type === 'coord' && `Jump to location`}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
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

                    <div className="flex flex-col relative group">
                        <button
                            onClick={handleExport}
                            disabled={points.length === 0 || exportProgress !== null}
                            className={`px-4 py-1.5 ${exportProgress !== null ? 'bg-amber-500' : 'bg-green-600 hover:bg-green-700'} disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-full text-[10px] font-bold transition-all shadow-sm flex items-center gap-2 uppercase tracking-tight`}
                        >
                            {exportProgress !== null ? (
                                <>
                                    <div className="animate-spin w-3 h-3 border-2 border-white rounded-full border-t-transparent" />
                                    Exporting... {exportProgress}%
                                </>
                            ) : (
                                <>
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Export QGIS
                                </>
                            )}
                        </button>

                        {exportProgress !== null && (
                            <div className="absolute -bottom-2 left-0 w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-600 transition-all duration-200" style={{ width: `${exportProgress}%` }}></div>
                            </div>
                        )}
                    </div>
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
                    <CopyCoordsHandler />
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
                    {(() => {
                        const lot = updatedLots.find(l => l.id === lotId);
                        const lotColor = lot ? lot.color : "#FFD700";

                        return points.length > 0 && (
                            <>
                                <Polyline
                                    positions={points.map(p => [p.lat, p.lng])}
                                    color={lotColor}
                                    weight={5}
                                    opacity={1} // Ensuring drawn line is always fully opaque (relative to its own path)
                                >
                                    <Tooltip sticky permanent={false} direction="top" className="line-tooltip-label">
                                        {fileName}
                                    </Tooltip>
                                </Polyline>
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
                        )
                    })()}
                </MapContainer>
            </div>
        </div>
    );
};

export default SingleFileView;
