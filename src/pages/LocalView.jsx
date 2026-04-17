import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';
import {
    ChangeView,
    ZoomHandler,
    CopyCoordsHandler,
    OPACITY_KEY,
    DEFAULT_OPACITY,
    SHOW_MAP_KEY,
    DEFAULT_SHOW_MAP,
    SHOW_SS_LABELS_KEY,
    DEFAULT_SS_LABELS,
    extractPointsFromCSV
} from './live/MapUtils';
import SubStationLayer from './live/SubStationLayer';
import { Upload, FileText, Trash2, Map as MapIcon, Layers, ChevronUp, ChevronDown, Search } from 'lucide-react';

const LocalView = () => {
    const [fileDatasets, setFileDatasets] = useState([]); // Array of { name, points, rawData, color }
    const [bounds, setBounds] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(13);
    const [error, setError] = useState(null);
    const [isMenuOpen, setIsMenuOpen] = useState(true); // Default to open
    const [layerSearch, setLayerSearch] = useState("");

    // Editor State
    const [editingIndex, setEditingIndex] = useState(null);
    const [editData, setEditData] = useState([]);
    const [editHeaders, setEditHeaders] = useState([]);

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

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#ec4899', '#06b6d4'];

    useEffect(() => {
        const pending = sessionStorage.getItem('viewer_pending_files');
        if (pending) {
            try {
                const files = JSON.parse(pending);
                const newDatasets = [];
                files.forEach((f, i) => {
                    Papa.parse(f.content, {
                        header: true,
                        skipEmptyLines: true,
                        transformHeader: (h) => h.trim(),
                        complete: (results) => {
                            const parsedPoints = extractPointsFromCSV(results.data);
                            if (parsedPoints.length > 0) {
                                newDatasets.push({
                                    name: f.name,
                                    points: parsedPoints,
                                    rawData: results.data,
                                    color: colors[(fileDatasets.length + newDatasets.length) % colors.length]
                                });
                            }
                            if (newDatasets.length === files.length) {
                                finalizeDatasets(newDatasets);
                                sessionStorage.removeItem('viewer_pending_files');
                            }
                        }
                    });
                });
            } catch (e) {
                console.error("Failed to load pending files", e);
            }
        }
    }, []);

    useEffect(() => {
        if (fileDatasets.length > 1) {
            document.title = `${fileDatasets.length} Files - Local Viewer`;
        } else if (fileDatasets.length === 1) {
            document.title = `Local: ${fileDatasets[0].name}`;
        } else {
            document.title = "Local File Viewer";
        }
    }, [fileDatasets]);

    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setError(null);
        const newDatasets = [];

        let processedCount = 0;
        files.forEach((file, index) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                transformHeader: (h) => h.trim(),
                complete: (results) => {
                    const parsedPoints = extractPointsFromCSV(results.data);
                    if (parsedPoints.length > 0) {
                        newDatasets.push({
                            name: file.name,
                            points: parsedPoints,
                            rawData: results.data,
                            color: colors[(fileDatasets.length + newDatasets.length) % colors.length]
                        });
                    }
                    processedCount++;
                    if (processedCount === files.length) {
                        finalizeDatasets(newDatasets);
                    }
                },
                error: (err) => {
                    setError(`Failed to parse ${file.name}: ${err.message}`);
                    processedCount++;
                    if (processedCount === files.length) {
                        finalizeDatasets(newDatasets);
                    }
                }
            });
        });
    };

    const finalizeDatasets = (newOnes) => {
        setFileDatasets(prev => {
            const combined = [...prev, ...newOnes];
            if (combined.length > 0) {
                const allPoints = combined.flatMap(d => d.points);
                const polyBounds = L.latLngBounds(allPoints.map(p => [p.lat, p.lng]));
                setBounds(polyBounds);
            }
            return combined;
        });
    };

    const clearFile = (index) => {
        setFileDatasets(prev => {
            const filtered = prev.filter((_, i) => i !== index);
            if (filtered.length > 0) {
                const allPoints = filtered.flatMap(d => d.points);
                const polyBounds = L.latLngBounds(allPoints.map(p => [p.lat, p.lng]));
                setBounds(polyBounds);
            } else {
                setBounds(null);
            }
            return filtered;
        });
    };

    const clearAll = () => {
        setFileDatasets([]);
        setBounds(null);
        setError(null);
    };

    const openEditor = (index) => {
        const ds = fileDatasets[index];
        setEditHeaders(Object.keys(ds.rawData[0] || {}));
        setEditData(JSON.parse(JSON.stringify(ds.rawData))); // Deep copy
        setEditingIndex(index);
    };

    const handleEditChange = (rIdx, header, value) => {
        const newData = [...editData];
        newData[rIdx][header] = value;
        setEditData(newData);
    };

    const saveEdits = () => {
        if (editingIndex === null) return;

        const newPoints = extractPointsFromCSV(editData);
        setFileDatasets(prev => {
            const next = [...prev];
            next[editingIndex] = {
                ...next[editingIndex],
                rawData: editData,
                points: newPoints
            };
            return next;
        });
        setEditingIndex(null);
    };

    const downloadDataset = (index) => {
        const ds = fileDatasets[index];
        const csv = Papa.unparse(ds.rawData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = ds.name.endsWith('.csv') ? ds.name : `${ds.name}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredLayers = fileDatasets.filter(ds =>
        ds.name.toLowerCase().includes(layerSearch.toLowerCase())
    );

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden bg-gray-50">
            {/* Toolbar */}
            <div className="bg-white p-3 shadow-md z-[1001] flex items-center justify-between border-b">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 border-r pr-4 border-gray-100">
                        <MapIcon className="text-primary-blue" size={20} />
                        <h2 className="text-sm font-bold uppercase tracking-tight text-gray-700">Quick Viewer</h2>
                    </div>

                    <label className="flex items-center gap-2 px-4 py-1.5 bg-primary-blue text-white rounded-full text-xs font-bold cursor-pointer hover:bg-blue-700 transition-all shadow-sm">
                        <Upload size={14} />
                        LOAD CSV(S)
                        <input type="file" accept=".csv" multiple onChange={handleFileUpload} className="hidden" />
                    </label>

                    {fileDatasets.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-gray-400 uppercase">{fileDatasets.length} Files Loaded</span>
                            <button onClick={clearAll} className="text-[10px] font-bold text-rose-500 hover:underline">Clear All</button>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-5 border-r pr-6 border-gray-100 text-gray-500">
                        <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => setShowMap(!showMap)}>
                            <div className={`w-8 h-4 rounded-full relative transition-all duration-200 ${showMap ? 'bg-primary-blue' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showMap ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                            <span className="text-[10px] font-bold group-hover:text-primary-blue transition-colors uppercase">MAP</span>
                        </div>

                        <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => setShowTowerLabels(!showTowerLabels)}>
                            <div className={`w-8 h-4 rounded-full relative transition-all duration-200 ${showTowerLabels ? 'bg-rose-500' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showTowerLabels ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                            <span className="text-[10px] font-bold group-hover:text-rose-500 transition-colors uppercase">TOWERS</span>
                        </div>

                        <div className="flex items-center gap-2 cursor-pointer select-none group" onClick={() => setShowDistLabels(!showDistLabels)}>
                            <div className={`w-8 h-4 rounded-full relative transition-all duration-200 ${showDistLabels ? 'bg-yellow-500' : 'bg-gray-300'}`}>
                                <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showDistLabels ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </div>
                            <span className="text-[10px] font-bold group-hover:text-yellow-600 transition-colors uppercase">DIST</span>
                        </div>
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

            {/* Main Content */}
            <div className="flex-grow relative bg-gray-100">
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center z-[2000] bg-white/80 backdrop-blur-sm">
                        <div className="bg-white p-8 rounded-3xl shadow-2xl border border-rose-100 text-center max-w-md">
                            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Trash2 size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Check your file</h3>
                            <p className="text-sm text-gray-500 mb-6 leading-relaxed">{error}</p>
                            <button onClick={clearFile} className="px-6 py-2 bg-primary-blue text-white rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all">
                                Try Another File
                            </button>
                        </div>
                    </div>
                )}

                {!fileDatasets.length && !error && (
                    <div className="absolute inset-0 flex items-center justify-center z-[1000] pointer-events-none">
                        <div className="text-center group">
                            <div className="w-24 h-24 bg-white rounded-3xl shadow-xl border border-gray-100 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500 pointer-events-auto cursor-pointer relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <Upload size={40} className="text-primary-blue relative z-10" />
                                <input type="file" accept=".csv" multiple onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                            </div>
                            <h3 className="text-2xl font-black text-gray-800 tracking-tight mb-2">Load Survey CSVs</h3>
                            <p className="text-gray-400 font-medium max-w-xs mx-auto text-sm leading-relaxed">
                                Upload one or more CSV files and visualize them instantly.
                            </p>
                        </div>
                    </div>
                )}

                {/* File List / Legend Overlay */}
                {fileDatasets.length > 0 && (
                    <div className="absolute top-4 left-4 z-[1000] w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[calc(100%-2rem)]">
                        <div className="p-3 bg-gray-50 border-b flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-2">
                                <Layers size={14} className="text-primary-blue" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Active Layers</span>
                                <span className="bg-blue-100 text-primary-blue px-1.5 py-0.5 rounded text-[9px] font-bold">{fileDatasets.length}</span>
                            </div>
                            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-1 hover:bg-white rounded transition-colors">
                                {isMenuOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                            </button>
                        </div>

                        {isMenuOpen && (
                            <>
                                <div className="p-2 border-b bg-white shrink-0">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Search layers..."
                                            value={layerSearch}
                                            onChange={(e) => setLayerSearch(e.target.value)}
                                            className="w-full pl-7 pr-3 py-1.5 text-[10px] bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-blue/10"
                                        />
                                        <svg className="w-3 h-3 absolute left-2.5 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    </div>
                                </div>
                                <div className="overflow-y-auto no-scrollbar py-1">
                                    {filteredLayers.length > 0 ? filteredLayers.map((ds, idx) => {
                                        // Find original index for actions
                                        const originalIndex = fileDatasets.findIndex(f => f.name === ds.name);
                                        return (
                                            <div key={idx} className="px-3 py-2.5 hover:bg-gray-50 flex items-center justify-between group border-b border-gray-50 last:border-0 transition-colors">
                                                <div className="flex items-center gap-3 min-w-0 flex-1 mr-2" title={ds.name}>
                                                    <div className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: ds.color }}></div>
                                                    <span className="text-[11px] font-bold text-gray-700 truncate block whitespace-nowrap overflow-hidden">{ds.name}</span>
                                                </div>
                                                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button onClick={() => openEditor(originalIndex)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors" title="Edit Data">
                                                        <FileText size={13} />
                                                    </button>
                                                    <button onClick={() => downloadDataset(originalIndex)} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-md transition-colors" title="Download CSV">
                                                        <Upload className="rotate-180" size={13} />
                                                    </button>
                                                    <button onClick={() => clearFile(originalIndex)} className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-md transition-colors" title="Remove Layer">
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div className="p-8 text-center">
                                            <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">No layers match search</p>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Editor Modal */}
                {editingIndex !== null && (
                    <div className="absolute inset-0 z-[3000] bg-white flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <MapIcon className="text-primary-blue" size={20} />
                                <div>
                                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">
                                        Editing: <span className="text-primary-blue">{fileDatasets[editingIndex].name}</span>
                                    </h3>
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                                        {editData.length} Data Rows • Changes reflect instantly on map after saving
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setEditingIndex(null)}
                                    className="px-4 py-2 text-[10px] font-black uppercase text-gray-500 hover:text-gray-700 tracking-widest transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveEdits}
                                    className="px-6 py-2 bg-primary-blue text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all active:scale-95"
                                >
                                    Apply & Save
                                </button>
                            </div>
                        </div>
                        <div className="flex-grow overflow-auto p-6 bg-gray-100/50">
                            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="bg-gray-900 text-white">
                                            <th className="p-3 text-[10px] font-black uppercase border-r border-white/10 w-12 sticky left-0 z-10 bg-gray-900">#</th>
                                            {editHeaders.map(h => (
                                                <th key={h} className="p-3 text-[10px] font-black uppercase border-r border-white/10 text-left min-w-[120px]">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {editData.map((row, rIdx) => (
                                            <tr key={rIdx} className="hover:bg-blue-50/10 transition-colors">
                                                <td className="p-2 text-[9px] font-bold text-gray-400 bg-gray-50 text-center border-r sticky left-0 z-5 bg-gray-50">
                                                    {rIdx + 1}
                                                </td>
                                                {editHeaders.map(header => (
                                                    <td key={header} className="p-0 border-r border-gray-100 last:border-0">
                                                        <input
                                                            type="text"
                                                            value={row[header] || ""}
                                                            onChange={(e) => handleEditChange(rIdx, header, e.target.value)}
                                                            className="w-full px-3 py-2 text-[11px] font-medium text-gray-700 outline-none focus:bg-blue-50/30 transition-colors"
                                                            spellCheck={false}
                                                        />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                <MapContainer
                    center={[11.0, 77.0]}
                    zoom={13}
                    bounds={bounds}
                    preferCanvas={true}
                    className="h-full w-full bg-gray-200"
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

                    {fileDatasets.map((ds, dsIdx) => (
                        <React.Fragment key={dsIdx}>
                            <Polyline
                                positions={ds.points.map(p => [p.lat, p.lng])}
                                color={ds.color}
                                weight={5}
                                opacity={1}
                            >
                                <Tooltip sticky permanent={false} direction="top" className="line-tooltip-label">
                                    {ds.name}
                                </Tooltip>
                            </Polyline>

                            {ds.points.map((pt, idx) => {
                                const nextPt = ds.points[idx + 1];
                                let distance = null;
                                let midpoint = null;

                                if (nextPt) {
                                    const p1 = L.latLng(pt.lat, pt.lng);
                                    const p2 = L.latLng(nextPt.lat, nextPt.lng);
                                    distance = Math.round(p1.distanceTo(p2));
                                    midpoint = [(pt.lat + nextPt.lat) / 2, (pt.lng + nextPt.lng) / 2];
                                }

                                return (
                                    <React.Fragment key={`${dsIdx}-${idx}`}>
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
                                                    <strong className="block border-b mb-1 pb-1">{ds.name}</strong>
                                                    <span className="block font-bold mt-1">Tower: {pt.towerNo}</span>
                                                    <span className="block font-mono text-[10px] opacity-70">{pt.lat}, {pt.lng}</span>
                                                </div>
                                            </Popup>
                                            {showTowerLabels && zoomLevel >= 16 && (
                                                <Tooltip permanent direction="top">
                                                    {(idx + 1)}-{pt.towerNo || '?'}
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
                                                    {distance}m
                                                </Tooltip>
                                            </CircleMarker>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </MapContainer>
            </div>
        </div>
    );
};

export default LocalView;
