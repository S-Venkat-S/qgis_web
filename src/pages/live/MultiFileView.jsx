import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';
import { updatedLots, ChangeView, ZoomHandler, OPACITY_KEY, DEFAULT_OPACITY, SHOW_MAP_KEY, DEFAULT_SHOW_MAP, SHOW_SS_LABELS_KEY, DEFAULT_SS_LABELS, SHOW_LINE_LABELS_KEY, DEFAULT_LINE_LABELS, exportQGISProject } from './MapUtils';
import SubStationLayer from './SubStationLayer';

const MultiFileView = () => {
    const { lotIds } = useParams(); // e.g. "lot1,lot2" or "all"
    const navigate = useNavigate();

    const initialSelectedIds = useMemo(() => {
        if (!lotIds || lotIds === 'all') return updatedLots.map(l => l.id);
        return lotIds.split(',').filter(id => updatedLots.find(l => l.id === id));
    }, [lotIds]);

    const [selectedLotIds, setSelectedLotIds] = useState(initialSelectedIds);
    const [multiMapData, setMultiMapData] = useState({});
    const [lotFiles, setLotFiles] = useState({});
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [bounds, setBounds] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(13);
    const [searchQuery, setSearchQuery] = useState("");
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
    const [showLineLabels, setShowLineLabels] = useState(() => {
        const saved = localStorage.getItem(SHOW_LINE_LABELS_KEY);
        return saved !== null ? JSON.parse(saved) : DEFAULT_LINE_LABELS;
    });

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
        localStorage.setItem(SHOW_LINE_LABELS_KEY, JSON.stringify(showLineLabels));
    }, [showLineLabels]);

    // Fetch Index files for all lots
    useEffect(() => {
        updatedLots.forEach(lot => {
            fetch(`${lot.basePath}index.txt?${Date.now()}`)
                .then(r => r.text())
                .then(text => {
                    const files = text.split('\n')
                        .map(l => l.trim())
                        .filter(l => l.length > 0 && l.toLowerCase().endsWith('.csv'))
                        .sort();
                    setLotFiles(prev => ({ ...prev, [lot.id]: files }));
                });
        });
    }, []);

    // Load actual data for selected lots
    useEffect(() => {
        const loadLots = async () => {
            const lotsToLoad = selectedLotIds.filter(id => !multiMapData[id]);
            if (lotsToLoad.length === 0) return;

            setIsLoading(true);
            setLoadingProgress(0);

            let filesToLoad = [];
            lotsToLoad.forEach(id => {
                if (lotFiles[id]) {
                    lotFiles[id].forEach(f => filesToLoad.push({ lotId: id, fileName: f }));
                }
            });

            if (filesToLoad.length === 0) {
                setIsLoading(false);
                return;
            }

            const newMapData = { ...multiMapData };
            let count = 0;
            const batchSize = 10;

            for (let i = 0; i < filesToLoad.length; i += batchSize) {
                const batch = filesToLoad.slice(i, i + batchSize);
                await Promise.all(batch.map(async (fileInfo) => {
                    const lot = updatedLots.find(l => l.id === fileInfo.lotId);
                    const fileUrl = `${lot.basePath}${fileInfo.fileName}`;

                    try {
                        const results = await new Promise((res, rej) => {
                            Papa.parse(fileUrl, { download: true, header: true, complete: res, error: rej });
                        });

                        const pts = results.data
                            .filter(row => {
                                const lat = row.Latitude || row.latitude;
                                const lng = row.Longitude || row.longitude;
                                return lat && lng;
                            })
                            .map(row => ({
                                lat: parseFloat(row.Latitude || row.latitude),
                                lng: parseFloat(row.Longitude || row.longitude),
                                towerNo: row['Tower No.'] || row['Tower No'] || row['S.No'] || row['s.no']
                            }))
                            .filter(pt => !isNaN(pt.lat) && !isNaN(pt.lng));

                        if (pts.length > 0) {
                            setMultiMapData(prev => {
                                const next = { ...prev };
                                if (!next[fileInfo.lotId]) next[fileInfo.lotId] = {};
                                next[fileInfo.lotId][fileInfo.fileName] = pts;
                                return next;
                            });
                        }
                    } catch (e) { console.warn(e); }
                    count++;
                    setLoadingProgress(Math.round((count / filesToLoad.length) * 100));
                }));
                await new Promise(r => setTimeout(r, 10));
            }

            setIsLoading(false);

            // Re-calc bounds
            const allPts = [];
            Object.values(newMapData).forEach(lData => {
                Object.values(lData).forEach(pts => {
                    if (pts.length > 0) {
                        allPts.push([pts[0].lat, pts[0].lng]);
                        allPts.push([pts[pts.length - 1].lat, pts[pts.length - 1].lng]);
                    }
                });
            });
            if (allPts.length > 0) setBounds(L.latLngBounds(allPts));
        };

        if (Object.keys(lotFiles).length > 0 && selectedLotIds.length > 0) {
            loadLots();
        }
    }, [selectedLotIds, lotFiles]);

    const toggleLot = (id) => {
        setSelectedLotIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const zoomToFile = (lid, fName, pts) => {
        if (!pts || pts.length === 0) return;
        const lineBounds = L.latLngBounds(pts.map(p => [p.lat, p.lng]));
        setBounds(lineBounds);
        setSearchQuery(""); // Clear search after zooming
    };

    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const results = [];
        Object.entries(multiMapData).forEach(([lid, lData]) => {
            Object.entries(lData).forEach(([fName, pts]) => {
                if (fName.toLowerCase().includes(searchQuery.toLowerCase())) {
                    results.push({ lid, fName, pts });
                }
            });
        });
        return results.slice(0, 50); // Limit results for performance
    }, [searchQuery, multiMapData]);

    const handleExport = () => {
        const layers = [];
        selectedLotIds.forEach(lid => {
            const lData = multiMapData[lid] || {};
            const color = lid === 'lot1' ? '#6366F1' : lid === 'lot2' ? '#34D399' : lid === 'lot3' ? '#FBBF24' : '#F87171';
            Object.entries(lData).forEach(([fName, pts]) => {
                layers.push({ id: `${lid}_${fName}`, name: fName, pts, color });
            });
        });
        if (layers.length > 0) {
            exportQGISProject(layers, "MultiLot_Survey");
        }
    };

    const handleBack = () => navigate('/live');

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
            <div className="bg-white p-3 border-b flex flex-col md:flex-row md:items-center gap-3 shadow-sm z-[1001]">
                <div className="flex items-center">
                    <button onClick={handleBack} className="mr-3 p-2 rounded-full hover:bg-gray-100 transition-colors">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                    <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1">
                        {updatedLots.map(l => (
                            <button
                                key={l.id}
                                onClick={() => toggleLot(l.id)}
                                className={`px-4 py-1.5 text-[11px] font-bold rounded-full border transition-all whitespace-nowrap shadow-sm ${selectedLotIds.includes(l.id) ? 'bg-primary-blue text-white ring-2 ring-primary-blue/20' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300'}`}
                            >
                                {l.id.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="md:ml-auto flex items-center gap-6">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Locate survey line..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 pr-4 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-blue/20 w-56 transition-all"
                        />
                        <svg className="w-3.5 h-3.5 absolute left-2.5 top-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>

                        {searchResults.length > 0 && (
                            <div className="absolute top-full right-0 mt-2 w-64 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-[2000] no-scrollbar">
                                <div className="p-2 border-b bg-gray-50 uppercase text-[9px] font-bold text-gray-400 sticky top-0">Search Results ({searchResults.length})</div>
                                {searchResults.map((res, i) => (
                                    <div
                                        key={i}
                                        onClick={() => zoomToFile(res.lid, res.fName, res.pts)}
                                        className="p-2.5 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors group"
                                    >
                                        <div className="text-[10px] font-bold text-gray-700 group-hover:text-primary-blue truncate">{res.fName}</div>
                                        <div className="text-[8px] text-gray-400 font-mono mt-0.5">{res.lid.toUpperCase()} • {res.pts.length} Towers</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {isLoading && (
                        <div className="flex items-center">
                            <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden mr-3">
                                <div className="h-full bg-primary-blue transition-all duration-300" style={{ width: `${loadingProgress}%` }}></div>
                            </div>
                            <span className="text-[10px] font-mono text-primary-blue font-bold">{loadingProgress}%</span>
                        </div>
                    )}
                    <div className="flex items-center gap-6 border-r pr-6 border-gray-100">
                        <div className="flex items-center gap-2 cursor-pointer select-none group" title="Toggle Map Tiles" onClick={() => setShowMap(!showMap)}>
                            <div className={`w-8 h-4 rounded-full relative transition-all duration-200 ${showMap ? 'bg-primary-blue' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showMap ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 group-hover:text-primary-blue transition-colors uppercase">MAP</span>
                        </div>

                        <div className="flex items-center gap-2 cursor-pointer select-none group" title="Toggle Line Labels" onClick={() => setShowLineLabels(!showLineLabels)}>
                            <div className={`w-8 h-4 rounded-full relative transition-all duration-200 ${showLineLabels ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showLineLabels ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400 group-hover:text-indigo-500 transition-colors uppercase">LINES</span>
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
                        disabled={Object.keys(multiMapData).length === 0}
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
                <MapContainer center={[11.0, 77.0]} zoom={13} bounds={bounds} className="h-full w-full">
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

                    {selectedLotIds.map(lid => {
                        const lData = multiMapData[lid] || {};
                        const color = lid === 'lot1' ? '#6366F1' : lid === 'lot2' ? '#34D399' : lid === 'lot3' ? '#FBBF24' : '#F87171';

                        return (
                            <React.Fragment key={lid}>
                                {Object.entries(lData).map(([fName, pts]) => {
                                    return (
                                        <Polyline
                                            key={`${lid}-${fName}`}
                                            positions={pts.map(p => [p.lat, p.lng])}
                                            color={color}
                                            weight={zoomLevel >= 15 ? 4 : 2}
                                            opacity={1}
                                            eventHandlers={{
                                                click: () => zoomToFile(lid, fName, pts)
                                            }}
                                        >
                                            {showLineLabels && (
                                                <Tooltip sticky permanent direction="center">
                                                    {fName.split(' ')[1] || fName.split(' ')[0]}
                                                </Tooltip>
                                            )}
                                            <Popup>
                                                <div className="text-[10px] min-w-[120px] p-1">
                                                    <strong className="block border-b mb-2 pb-1 text-primary-blue">{fName}</strong>
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-gray-500 font-medium">Towers: {pts.length}</span>
                                                        <button
                                                            onClick={() => window.open(`/live/${lid}/${fName}`, '_blank')}
                                                            className="w-full py-1.5 px-3 bg-primary-blue text-white rounded text-[9px] font-bold hover:bg-blue-700 transition-colors shadow-sm"
                                                        >
                                                            OPEN DETAILED VIEW
                                                        </button>
                                                    </div>
                                                </div>
                                            </Popup>
                                        </Polyline>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                </MapContainer>
            </div>
        </div>
    );
};

export default MultiFileView;
