import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatedLots } from './live/MapUtils';
import Papa from 'papaparse';

const getDistance = (p1, p2) => {
    if (!p1 || !p2) return 0;
    const R = 6371; // km
    const dLat = (p2.lat - p1.lat) * Math.PI / 180;
    const dLon = (p2.lng - p1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export default function Live() {
    const navigate = useNavigate();
    const [expandedLot, setExpandedLot] = useState(null);
    const [lotFiles, setLotFiles] = useState({});
    const [fileStats, setFileStats] = useState({}); // { fileName: { length: km, points: n, date: string } }
    const [searchQuery, setSearchQuery] = useState("");
    const [sortConfigs, setSortConfigs] = useState({}); // { lotId: 'name' | 'km' | 'towers' | 'date' }
    const [lotProgress, setLotProgress] = useState({}); // { lotId: percentage }
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Fetch Index files (Initial light load)
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
                })
                .catch(err => console.error(`Error loading lot index ${lot.id}:`, err));
        });

        // Load cached stats from previous sessions
        const cached = localStorage.getItem('survey_stats_cache');
        if (cached) setFileStats(JSON.parse(cached));
    }, []);

    // Lazy load stats only when a lot is expanded
    useEffect(() => {
        if (!expandedLot || !lotFiles[expandedLot]) return;

        const filesToFetch = lotFiles[expandedLot].filter(f => !fileStats[`${expandedLot}_${f}`]);
        if (filesToFetch.length === 0) {
            setLotProgress(prev => ({ ...prev, [expandedLot]: 100 }));
            return;
        }

        const lot = updatedLots.find(l => l.id === expandedLot);
        if (!lot) return;

        let processedCount = 0;
        const totalToFetch = filesToFetch.length;
        const batchSize = 10;

        const fetchNextBatch = () => {
            const batch = filesToFetch.slice(processedCount, processedCount + batchSize);
            if (batch.length === 0) {
                localStorage.setItem('survey_stats_cache', JSON.stringify(fileStats));
                setLotProgress(prev => ({ ...prev, [expandedLot]: 100 }));
                return;
            }

            setLotProgress(prev => ({
                ...prev,
                [expandedLot]: Math.round((processedCount / totalToFetch) * 100)
            }));

            Promise.all(batch.map(fileName => {
                const fileUrl = `${lot.basePath}${fileName}`;
                return fetch(fileUrl)
                    .then(r => {
                        const lastModified = r.headers.get('Last-Modified');
                        return r.text().then(text => ({ text, lastModified, fileName }));
                    })
                    .catch(() => null);
            })).then(results => {
                const newStatsForBatch = {};
                results.forEach(res => {
                    if (!res) return;
                    Papa.parse(res.text, {
                        header: true,
                        complete: (pResults) => {
                            let totalDist = 0;
                            const pts = pResults.data
                                .map(r => ({
                                    lat: parseFloat(r.Latitude || r.lat || r.LATITUDE),
                                    lng: parseFloat(r.Longitude || r.lng || r.LONGITUDE)
                                }))
                                .filter(p => !isNaN(p.lat) && !isNaN(p.lng));

                            for (let i = 0; i < pts.length - 1; i++) {
                                totalDist += getDistance(pts[i], pts[i + 1]);
                            }

                            newStatsForBatch[`${expandedLot}_${res.fileName}`] = {
                                length: totalDist,
                                points: pts.length,
                                date: res.lastModified ? new Date(res.lastModified).toLocaleDateString('en-GB', {
                                    day: '2-digit', month: 'short', year: 'numeric'
                                }) : 'Unknown'
                            };
                        }
                    });
                });

                setFileStats(prev => {
                    const merged = { ...prev, ...newStatsForBatch };
                    // Optional: Periodic sync to storage for larger lots
                    return merged;
                });
                processedCount += batchSize;
                setTimeout(fetchNextBatch, 50);
            });
        };

        fetchNextBatch();
    }, [expandedLot, lotFiles, refreshTrigger]);

    const clearAllCache = () => {
        if (!window.confirm("Clear all cached KM/Tower stats? This will force a re-scan of all files.")) return;
        localStorage.removeItem('survey_stats_cache');
        setFileStats({});
        window.location.reload();
    };

    const refreshLot = (lotId) => {
        const files = lotFiles[lotId] || [];
        setFileStats(prev => {
            const next = { ...prev };
            files.forEach(f => delete next[`${lotId}_${f}`]);
            return next;
        });
        setLotProgress(prev => ({ ...prev, [lotId]: 0 }));
        setRefreshTrigger(prev => prev + 1);
    };

    const viewSingleFile = (lotId, fileName) => navigate(`/live/${lotId}/${fileName}`);
    const editSingleFile = (lotId, fileName) => navigate(`/live/edit/${lotId}/${fileName}`);
    const viewLot = (lotId) => navigate(`/live/lot/${lotId}`);
    const viewAllLots = () => navigate('/live/lot/all');

    return (
        <div className="min-h-[calc(100vh-4rem)] bg-gray-50 flex flex-col items-center p-4 md:p-8">
            <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-6 md:p-8">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 border-b pb-6">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl md:text-3xl font-extrabold text-primary-blue tracking-tight">Survey Dashboard</h1>
                        <div className="flex gap-2">
                            <button onClick={viewAllLots} className="text-[10px] bg-primary-blue text-white px-4 py-1.5 rounded-lg font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md active:scale-95 text-center">
                                Network Overview
                            </button>
                            <button onClick={clearAllCache} className="text-[10px] bg-white text-gray-400 border border-gray-100 px-3 py-1.5 rounded-lg font-bold hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-95" title="Purge local stats cache">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                        </div>
                    </div>
                    <div className="relative w-full md:w-64">
                        <input type="text" placeholder="Search by filename..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-primary-blue focus:ring-4 focus:ring-primary-blue/5 transition-all bg-gray-50/30" />
                        <svg className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-5">
                    {/* Global Assets Section */}
                    <div className="border rounded-xl overflow-hidden bg-white shadow-sm border-amber-200 ring-1 ring-amber-100">
                        <div className="px-6 py-4 flex justify-between items-center bg-amber-50/30">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-amber-100 rounded-lg text-amber-600">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Global Assets</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[10px] font-bold text-amber-600">All Sub Station.csv</span>
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => navigate('/live/edit/root/All Sub Station.csv')} className="px-4 py-2 bg-white text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-lg border border-amber-200 hover:bg-amber-600 hover:text-white transition-all shadow-sm">
                                    Edit Records
                                </button>
                                <button onClick={() => navigate('/live/root/All Sub Station.csv')} className="px-4 py-2 bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-md hover:bg-amber-700 transition-all">
                                    View Map
                                </button>
                            </div>
                        </div>
                    </div>

                    {updatedLots.map((lot) => {
                        const rawFiles = (lotFiles[lot.id] || []).filter(f => f.toLowerCase().includes(searchQuery.toLowerCase()));
                        const sortMode = sortConfigs[lot.id] || 'name';
                        const files = [...rawFiles].sort((a, b) => {
                            const statA = fileStats[`${lot.id}_${a}`];
                            const statB = fileStats[`${lot.id}_${b}`];
                            if (sortMode === 'km') return (statB?.length || 0) - (statA?.length || 0);
                            if (sortMode === 'towers') return (statB?.points || 0) - (statA?.points || 0);
                            if (sortMode === 'date') return new Date(statB?.date || 0) - new Date(statA?.date || 0);
                            return a.localeCompare(b);
                        });
                        const isExpanded = expandedLot === lot.id;

                        return (
                            <div key={lot.id} className={`border rounded-xl overflow-hidden bg-white transition-all duration-300 ${isExpanded ? 'shadow-md border-primary-blue/20 ring-1 ring-primary-blue/10' : 'border-gray-200 hover:border-gray-300 shadow-sm'}`}>
                                <div className={`px-6 py-4 flex justify-between items-center ${isExpanded ? 'bg-primary-blue/5' : 'bg-gray-50/50'}`}>
                                    <div className="flex-grow">
                                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                            {lot.name}
                                            <span className={`w-2 h-2 rounded-full ${lot.id === 'lot1' ? 'bg-indigo-500' : lot.id === 'lot2' ? 'bg-emerald-500' : lot.id === 'lot3' ? 'bg-amber-500' : 'bg-rose-500'}`}></span>
                                        </h3>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <p className="text-xs text-gray-500 font-medium">{files.length} Surveys</p>
                                            <span className="text-gray-300">|</span>
                                            {isExpanded && lotProgress[lot.id] < 100 && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary-blue transition-all duration-300" style={{ width: `${lotProgress[lot.id] || 0}%` }}></div>
                                                    </div>
                                                    <span className="text-[9px] font-black text-primary-blue uppercase">{lotProgress[lot.id] || 0}% CALCULATING...</span>
                                                </div>
                                            )}
                                            {(!isExpanded || lotProgress[lot.id] === 100 || !lotProgress[lot.id]) && (() => {
                                                const totalKm = files.reduce((acc, f) => acc + (fileStats[`${lot.id}_${f}`]?.length || 0), 0);
                                                if (totalKm > 0) {
                                                    return (
                                                        <p className="text-xs text-primary-blue font-black uppercase tracking-tight">
                                                            {totalKm.toFixed(2)} KM TOTAL
                                                        </p>
                                                    );
                                                }
                                                return (
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest italic opacity-70">
                                                        {files.length > 0 ? "Awaiting Analysis" : "No Surveys"}
                                                    </p>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                    <div className="flex gap-3 items-center">
                                        {isExpanded && (
                                            <div className="flex gap-2">
                                                <button onClick={() => refreshLot(lot.id)} className="p-2 border border-blue-100 bg-white text-blue-500 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm" title="Refresh stats for this Lot">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                </button>
                                                <select value={sortMode} onChange={(e) => setSortConfigs(prev => ({ ...prev, [lot.id]: e.target.value }))} className="text-[10px] font-black uppercase tracking-widest bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-primary-blue transition-all text-gray-600">
                                                    <option value="name">Sort: Name</option>
                                                    <option value="km">Sort: KM (High-Low)</option>
                                                    <option value="towers">Sort: Towers</option>
                                                    <option value="date">Sort: Recent</option>
                                                </select>
                                            </div>
                                        )}
                                        <button onClick={() => viewLot(lot.id)} className="px-5 py-2 bg-white text-primary-blue text-[11px] font-bold rounded-lg border border-primary-blue/20 shadow-sm hover:bg-primary-blue hover:text-white transition-all transform hover:-translate-y-px">EXPLORE LOT</button>
                                        <button onClick={() => setExpandedLot(isExpanded ? null : lot.id)} className={`p-2 border rounded-lg transition-colors ${isExpanded ? 'bg-white border-primary-blue/20 text-primary-blue' : 'bg-white border-gray-100 text-gray-400 hover:text-gray-600'}`}>
                                            <svg className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                    </div>
                                </div>
                                {isExpanded && (
                                    <div className="border-t border-gray-100 p-3 max-h-[440px] overflow-y-auto bg-white custom-scrollbar">
                                        <div className="space-y-1">
                                            {files.map((file, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 hover:bg-primary-blue/5 rounded-xl group border border-transparent hover:border-primary-blue/10 transition-all cursor-default">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-primary-blue/10 group-hover:text-primary-blue transition-colors">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="text-xs font-semibold text-gray-700 truncate group-hover:text-primary-blue transition-colors block" title={file}>{file}</span>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                                                                    {fileStats[`${lot.id}_${file}`]
                                                                        ? `${fileStats[`${lot.id}_${file}`].length.toFixed(3)} KM • ${fileStats[`${lot.id}_${file}`].points} TOWERS`
                                                                        : "Analysis Pending..."
                                                                    }
                                                                </span>
                                                                <span className="text-gray-200">|</span>
                                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">UPDATED: {fileStats[`${lot.id}_${file}`]?.date || '--'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => editSingleFile(lot.id, file)} className="opacity-0 group-hover:opacity-100 py-2 px-4 text-[10px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white rounded-lg transition-all transform hover:scale-105 active:scale-95 whitespace-nowrap border border-indigo-100">EDIT CSV</button>
                                                        <button onClick={() => viewSingleFile(lot.id, file)} className="opacity-0 group-hover:opacity-100 py-2 px-4 text-[10px] font-bold text-white bg-primary-blue rounded-lg shadow-md hover:bg-blue-700 transition-all transform hover:scale-105 active:scale-95 whitespace-nowrap">VIEW MAP</button>
                                                    </div>
                                                </div>
                                            ))}
                                            {files.length === 0 && <div className="text-center py-10 opacity-40"><p className="text-xs font-bold italic">No matching survey found</p></div>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
            `}</style>
        </div>
    );
}
