import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';
import { updatedLots, ChangeView, ZoomHandler, CopyCoordsHandler, OPACITY_KEY, DEFAULT_OPACITY, SHOW_MAP_KEY, DEFAULT_SHOW_MAP, SHOW_SS_LABELS_KEY, DEFAULT_SS_LABELS, SHOW_LINE_LABELS_KEY, DEFAULT_LINE_LABELS, exportQGISProject, parseCoords, getCoordinateFromParams, extractPointsFromCSV, fetchAndUnzip, parseIndexFile } from './MapUtils';
import SubStationLayer from './SubStationLayer';

const MultiFileView = () => {
    const { lotIds, '*': urlFileName } = useParams(); // e.g. "lot1,lot2" or "all", and optional file path
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const initialSelectedIds = useMemo(() => {
        if (!lotIds) return [];
        if (lotIds === 'all') return updatedLots.map(l => l.id);
        if (lotIds === 'custom') return ['custom'];
        return lotIds.split(',').filter(id => updatedLots.find(l => l.id === id));
    }, [lotIds]);

    const [selectedLotIds, setSelectedLotIds] = useState(initialSelectedIds);
    const [multiMapData, setMultiMapData] = useState({});
    const [lotFiles, setLotFiles] = useState({});
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [exportProgress, setExportProgress] = useState(null);
    const [lotVersions, setLotVersions] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [bounds, setBounds] = useState(null);
    const [subStations, setSubStations] = useState([]);
    const [zoomLevel, setZoomLevel] = useState(13);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchCenter, setSearchCenter] = useState(null); // Point to jump to
    const [searchMarker, setSearchMarker] = useState(null); // Persistent marker for search

    // Clear search marker after 4 seconds
    useEffect(() => {
        if (searchMarker) {
            const timer = setTimeout(() => {
                setSearchMarker(null);
                setSearchCenter(null);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [searchMarker]);
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
    const [showTowerLabels, setShowTowerLabels] = useState(true);
    const [showDistLabels, setShowDistLabels] = useState(true);
    const [focusedLine, setFocusedLine] = useState(null); // { lid, fName, pts }

    useEffect(() => {
        document.title = selectedLotIds.length > 0 ? `Map: ${selectedLotIds.map(id => id.toUpperCase()).join(', ')}` : "Multi-Lot Map";
        localStorage.setItem(OPACITY_KEY, mapOpacity);
    }, [mapOpacity, selectedLotIds]);

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
                    const { version, files } = parseIndexFile(text);
                    setLotVersions(prev => ({ ...prev, [lot.id]: version }));
                    setLotFiles(prev => ({ 
                        ...prev, 
                        [lot.id]: files.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }))
                    }));
                });
        });

        // Load Substations for search
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

    // Load actual data for selected lots
    useEffect(() => {
        const loadLots = async () => {
            const isCustom = lotIds === 'custom';
            // Only load lots that aren't already in memory
            const lotsToLoad = isCustom 
                ? Array.from(new Set(searchParams.get('files')?.split(',').map(f => f.split('|')[0])))
                : selectedLotIds.filter(id => !multiMapData[id]);

            if (lotsToLoad.length === 0) {
                if (!bounds && Object.keys(multiMapData).length > 0) recalculateBounds(multiMapData);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setLoadingProgress(0);

            const updatedData = { ...multiMapData };
            let lotCount = 0;

            for (const lid of lotsToLoad) {
                const lot = updatedLots.find(l => l.id === lid);
                if (!lot) continue;

                try {
                    const version = lotVersions[lid] || Date.now();
                    const zipUrl = `${lot.basePath}lot_bundle.zip?v=${version}`;
                    const zip = await fetchAndUnzip(zipUrl);
                    
                    if (!updatedData[lid]) updatedData[lid] = {};

                    // If custom, only extract specific files. Otherwise extract all.
                    let filesToExtract = [];
                    if (isCustom) {
                        const filesParam = searchParams.get('files') || "";
                        filesToExtract = filesParam.split(',')
                            .filter(f => f.startsWith(`${lid}|`))
                            .map(f => f.split('|')[1]);
                    } else {
                        filesToExtract = lotFiles[lid] || [];
                    }

                    for (const fileName of filesToExtract) {
                        const zipEntryName = fileName.includes('/') ? fileName.split('/').pop() : fileName;
                        const zipFile = zip.file(zipEntryName);
                        if (zipFile) {
                            const content = await zipFile.async("string");
                            const pResults = Papa.parse(content, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
                            updatedData[lid][fileName] = extractPointsFromCSV(pResults.data);
                        }
                    }
                } catch (e) {
                    console.error(`Failed to load zip for lot ${lid}:`, e);
                }
                
                lotCount++;
                setLoadingProgress(Math.round((lotCount / lotsToLoad.length) * 100));
                setMultiMapData({ ...updatedData });
            }

            // Only auto-fit bounds on the very first load if no bounds are set
            if (!bounds) {
                const allPts = [];
                Object.values(updatedData).forEach(lFiles => {
                    Object.values(lFiles).forEach(pts => {
                        if (pts.length > 0) {
                            allPts.push([pts[0].lat, pts[0].lng]);
                            allPts.push([pts[pts.length - 1].lat, pts[pts.length - 1].lng]);
                        }
                    });
                });
                if (allPts.length > 0) {
                    const qCoord = getCoordinateFromParams(searchParams);
                    // Skip if explicit fileName is in URL
                    if (!qCoord && !urlFileName) setBounds(L.latLngBounds(allPts));
                }
            }
            setIsLoading(false);
        };

        // Helper for manual fitting if needed
        const fitAll = () => {
            const allPts = [];
            const isCustom = lotIds === 'custom';
            const filesParam = searchParams.get('files') || "";
            const customFiles = isCustom ? filesParam.split(',').map(f => f.split('|')[1]) : [];

            Object.entries(multiMapData).forEach(([lid, lFiles]) => {
                if (!isCustom && !selectedLotIds.includes(lid)) return;
                Object.entries(lFiles).forEach(([fName, pts]) => {
                    if (isCustom && !customFiles.includes(fName)) return;
                    if (pts.length > 0) {
                        allPts.push([pts[0].lat, pts[0].lng]);
                        allPts.push([pts[pts.length - 1].lat, pts[pts.length - 1].lng]);
                    }
                });
            });

            if (allPts.length > 0) {
                setBounds(L.latLngBounds(allPts));
            }
        };

        if (Object.keys(lotFiles).length > 0 && selectedLotIds.length > 0) {
            loadLots();
        }
    }, [selectedLotIds, lotFiles, urlFileName, searchParams]);

    // Handle URL-based file and range focusing
    useEffect(() => {
        if (!urlFileName || Object.keys(multiMapData).length === 0) return;

        const rangeMatch = urlFileName.match(/@(\d+):(\d+)$/);
        const actualFileName = rangeMatch ? urlFileName.substring(0, rangeMatch.index) : urlFileName;
        
        // Find which lot owns this file
        let foundLid = null;
        let foundPts = null;

        for (const [lid, files] of Object.entries(multiMapData)) {
            if (files[actualFileName]) {
                foundLid = lid;
                foundPts = files[actualFileName];
                break;
            }
        }

        if (foundLid && foundPts) {
            let ptsToUse = foundPts;
            if (rangeMatch) {
                const start = parseInt(rangeMatch[1]);
                const end = parseInt(rangeMatch[2]);
                ptsToUse = foundPts.slice(start - 1, end);
            }
            
            // Only update if actually different to prevent loops
            if (!focusedLine || focusedLine.fName !== urlFileName) {
                setFocusedLine({ lid: foundLid, fName: urlFileName, pts: ptsToUse });
                const lineBounds = L.latLngBounds(ptsToUse.map(p => [p.lat, p.lng]));
                setBounds(lineBounds);
            }
        }
    }, [urlFileName, multiMapData]);

    const toggleLot = (id) => {
        setSelectedLotIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const zoomToFile = (lid, fName, pts) => {
        if (!pts || pts.length === 0) return;
        const lineBounds = L.latLngBounds(pts.map(p => [p.lat, p.lng]));
        setBounds(lineBounds);
        setSearchQuery(""); // Clear search after zooming
        setFocusedLine({ lid, fName, pts });
    };

    const searchResults = useMemo(() => {
        const query = searchQuery.trim();
        if (!query) return [];

        const results = [];

        // 1. Check if it's a coordinate pair
        const coords = parseCoords(query);
        if (coords) {
            results.push({ type: 'coord', lat: coords.lat, lng: coords.lng, name: `Go to: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} ` });
        }

        // 2. Search Survey Lines
        Object.entries(multiMapData).forEach(([lid, lData]) => {
            Object.entries(lData).forEach(([fName, pts]) => {
                if (fName.toLowerCase().includes(query.toLowerCase())) {
                    results.push({ type: 'line', lid, fName, pts, name: fName });
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
    }, [searchQuery, multiMapData, subStations]);

    const handleSearchResultClick = (res) => {
        if (res.type === 'line') {
            zoomToFile(res.lid, res.fName, res.pts);
            setSearchMarker(null);
            setSearchCenter(null);
        } else if (res.type === 'coord' || res.type === 'ss') {
            setSearchCenter({ lat: res.lat, lng: res.lng });
            setSearchMarker({ lat: res.lat, lng: res.lng, name: res.name });
            setSearchQuery("");
        }
    };

    // Handle initial coord jump
    useEffect(() => {
        const qCoord = getCoordinateFromParams(searchParams);
        if (qCoord) {
            setSearchCenter({ lat: qCoord.lat, lng: qCoord.lng });
            setSearchMarker({ lat: qCoord.lat, lng: qCoord.lng, name: 'Target Location' });
        }
    }, [searchParams]);

    const handleExport = async () => {
        const layers = [];
        selectedLotIds.forEach(lid => {
            const lData = multiMapData[lid] || {};
            const lot = updatedLots.find(l => l.id === lid);
            const color = lot ? lot.color : '#FFD700';
            Object.entries(lData).forEach(([fName, pts]) => {
                layers.push({ id: `${lid}_${fName}`, name: fName, pts, color });
            });
        });
        if (layers.length > 0) {
            setExportProgress(0);
            try {
                await exportQGISProject(layers, "MultiLot_Survey", setExportProgress);
            } catch (e) {
                console.error("Export error:", e);
            } finally {
                setExportProgress(null);
            }
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
                    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                        {lotIds === 'custom' ? (
                            <div className="px-4 py-1.5 text-[10px] font-black rounded-full border bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-100 shadow-sm uppercase tracking-wider">
                                {searchParams.get('name') || "Custom Group"}
                            </div>
                        ) : (
                            updatedLots.map(l => (
                                <button
                                    key={l.id}
                                    onClick={() => toggleLot(l.id)}
                                    className={`px-4 py-1.5 text-[10px] font-black rounded-full border transition-all whitespace-nowrap shadow-sm uppercase tracking-wider ${selectedLotIds.includes(l.id) ? 'text-white border-transparent ring-2' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
                                    style={selectedLotIds.includes(l.id) ? { backgroundColor: l.color, ringColor: `${l.color}33` } : {}}
                                >
                                    {l.name}
                                </button>
                            ))
                        )}
                    </div>
                </div>

                <div className="md:ml-auto flex flex-wrap items-center justify-end gap-x-6 gap-y-3">
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
                            <div className="absolute top-full right-0 mt-2 w-72 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-[2000] no-scrollbar">
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
                                                <div className="text-[11px] font-bold text-gray-700 group-hover:text-primary-blue transition-colors truncate uppercase tracking-tight whitespace-pre-wrap">{res.name}</div>
                                                <div className="text-[9px] text-gray-400 font-medium truncate">
                                                    {res.type === 'line' && `${res.lid.toUpperCase()} • ${res.pts.length} Towers`}
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

                        {focusedLine && (
                            <>
                                <div className="border-l h-4 mx-1 border-gray-100"></div>
                                <div className="flex items-center gap-2 cursor-pointer select-none group" title="Toggle Focused Towers" onClick={() => setShowTowerLabels(!showTowerLabels)}>
                                    <div className={`w-8 h-4 rounded-full relative transition-all duration-200 ${showTowerLabels ? 'bg-rose-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showTowerLabels ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400 group-hover:text-rose-500 transition-colors uppercase">TOWERS</span>
                                </div>
                                <div className="flex items-center gap-2 cursor-pointer select-none group" title="Toggle Focused Dist" onClick={() => setShowDistLabels(!showDistLabels)}>
                                    <div className={`w-8 h-4 rounded-full relative transition-all duration-200 ${showDistLabels ? 'bg-yellow-500' : 'bg-gray-300'}`}>
                                        <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showDistLabels ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400 group-hover:text-yellow-600 transition-colors uppercase">DIST</span>
                                </div>
                                <button
                                    onClick={() => setFocusedLine(null)}
                                    className="ml-2 p-1.5 bg-gray-100 hover:bg-rose-50 text-gray-400 hover:text-rose-500 rounded-full transition-all"
                                    title="Clear Focus"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <button
                            onClick={handleExport}
                            disabled={Object.keys(multiMapData).length === 0 || exportProgress !== null}
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
                        <div className="flex flex-col items-end min-w-[100px]">
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
                    <ChangeView bounds={bounds} center={searchCenter} />
                    <ZoomHandler onZoom={setZoomLevel} />
                    <CopyCoordsHandler />
                    
                    {searchMarker && (
                        <CircleMarker
                            center={[searchMarker.lat, searchMarker.lng]}
                            radius={8}
                            pathOptions={{
                                color: '#00ffff',
                                fillColor: '#00ffff',
                                fillOpacity: 0.6,
                                weight: 2,
                                className: 'pulse-marker'
                            }}
                        >
                            <Popup>
                                <div className="text-[11px] p-1">
                                    <div className="font-black text-primary-blue uppercase mb-1">Search Result</div>
                                    <div className="font-medium text-gray-700 mb-2">{searchMarker.name}</div>
                                    <button 
                                        onClick={() => setSearchMarker(null)}
                                        className="w-full py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-[9px] font-bold transition-colors"
                                    >
                                        CLEAR POINTER
                                    </button>
                                </div>
                            </Popup>
                            <Tooltip permanent direction="top" className="search-tooltip">
                                Search Point
                            </Tooltip>
                        </CircleMarker>
                    )}
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
                        const lot = updatedLots.find(l => l.id === lid);
                        const color = lot ? lot.color : '#FFD700';

                        return (
                            <React.Fragment key={lid}>
                                {Object.entries(lData).map(([fName, pts]) => {
                                    return (
                                            <Polyline
                                                key={`${lid}-${fName}`}
                                                positions={pts.map(p => [p.lat, p.lng])}
                                                color={color}
                                                weight={focusedLine?.fName === fName ? 6 : (zoomLevel >= 15 ? 4 : 2)}
                                                opacity={focusedLine && focusedLine.fName !== fName ? 0.3 : 1}
                                            >
                                                {showLineLabels && (
                                                    <Tooltip sticky permanent={false} direction="top" className="line-tooltip-label whitespace-pre-wrap">
                                                        {fName.split(' ')[1] || fName.split(' ')[0]}
                                                    </Tooltip>
                                                )}
                                                <Popup maxWidth={320} minWidth={240}>
                                                    <div className="p-1">
                                                        <strong className="block border-b mb-2 pb-1 text-primary-blue whitespace-pre-wrap text-[11px] leading-tight uppercase tracking-tight">{fName}</strong>
                                                            <div className="flex gap-4 mt-2">
                                                                <button
                                                                    onClick={() => window.open(`/live/${lid}/${encodeURIComponent(fName)}`, '_blank')}
                                                                    className="p-1 px-2 border border-gray-200 text-gray-400 hover:text-primary-blue hover:border-primary-blue/30 rounded transition-all shadow-sm flex items-center gap-1.5 group"
                                                                    title="Open in new window"
                                                                >
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                                                    <span className="text-[9px] font-bold uppercase tracking-tight">Open Link</span>
                                                                </button>

                                                                <div 
                                                                    className="flex items-center gap-2 cursor-pointer select-none group" 
                                                                    onClick={() => {
                                                                        if (focusedLine?.fName === fName) setFocusedLine(null);
                                                                        else setFocusedLine({ lid, fName, pts });
                                                                    }}
                                                                >
                                                                    <span className={`text-[9px] font-black transition-colors uppercase tracking-tight ${focusedLine?.fName === fName ? 'text-rose-500' : 'text-gray-400 group-hover:text-rose-400'}`}>Show Details</span>
                                                                    <div className={`w-7 h-3.5 rounded-full relative transition-all duration-200 ${focusedLine?.fName === fName ? 'bg-rose-500' : 'bg-gray-200'}`}>
                                                                        <div className={`absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform ${focusedLine?.fName === fName ? 'translate-x-3.5' : 'translate-x-0'}`}></div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                </Popup>
                                            </Polyline>
                                    );
                                })}

                                {focusedLine && focusedLine.lid === lid && (
                                    <>
                                        {/* 1. Tower Markers (Mid+ Zoom Priority: 15+) */}
                                        {zoomLevel >= 15 && focusedLine.pts.map((pt, idx) => (
                                            <CircleMarker
                                                key={`focus-pt-${lid}-${idx}`}
                                                center={[pt.lat, pt.lng]}
                                                radius={zoomLevel >= 17 ? 5 : 3}
                                                pathOptions={{
                                                    color: 'red',
                                                    fillColor: '#f03',
                                                    fillOpacity: 1,
                                                    weight: 1
                                                }}
                                            >
                                                <Popup maxWidth={280} minWidth={200}>
                                                    <div className="text-black p-1">
                                                        <strong className="block border-b mb-2 pb-1 whitespace-pre-wrap text-[11px] leading-tight text-primary-blue">{focusedLine.fName}</strong>
                                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                                                            <div className="flex flex-col">
                                                                <span className="text-[8px] uppercase font-bold text-gray-400">Position</span>
                                                                <span className="text-[11px] font-bold">Tower {pt.towerNo}</span>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[8px] uppercase font-bold text-gray-400">Index</span>
                                                                <span className="text-[11px] font-bold">#{idx + 1}</span>
                                                            </div>
                                                            <div className="col-span-2 pt-1 border-t mt-1">
                                                                <span className="block font-mono text-[9px] text-gray-500 tracking-tighter">{pt.lat.toFixed(6)}, {pt.lng.toFixed(6)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Popup>
                                                {showTowerLabels && zoomLevel >= 15 && (
                                                    <Tooltip permanent direction="top">
                                                        {idx + 1}-{pt.towerNo}
                                                    </Tooltip>
                                                )}
                                            </CircleMarker>
                                        ))}

                                        {/* 2. Distance Labels (High Zoom Priority: 16+) */}
                                        {showDistLabels && zoomLevel >= 16 && focusedLine.pts.map((pt, idx) => {
                                            const nextPt = focusedLine.pts[idx + 1];
                                            if (!nextPt) return null;
                                            const p1 = L.latLng(pt.lat, pt.lng);
                                            const p2 = L.latLng(nextPt.lat, nextPt.lng);
                                            const distance = Math.round(p1.distanceTo(p2));
                                            const midpoint = [(pt.lat + nextPt.lat) / 2, (pt.lng + nextPt.lng) / 2];

                                            return (
                                                <CircleMarker
                                                    key={`dist-${lid}-${idx}`}
                                                    center={midpoint}
                                                    radius={0}
                                                    pathOptions={{ opacity: 0, fillOpacity: 0 }}
                                                >
                                                    <Tooltip permanent direction="center">
                                                        {distance}
                                                    </Tooltip>
                                                </CircleMarker>
                                            );
                                        })}
                                    </>
                                )}
                            </React.Fragment >
                        );
                    })}
                </MapContainer >
            </div >
        </div >
    );
};

export default MultiFileView;
