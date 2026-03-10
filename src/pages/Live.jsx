
import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useParams, useNavigate } from 'react-router-dom';

// Fix Leaflet's default icon path issues in React
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Helper: Calculate distance between two lat/lng points in meters
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

const updatedLots = [
    { id: 'lot1', name: 'LOT 1', basePath: '/view/LOT_1/' },
    { id: 'lot2', name: 'LOT 2', basePath: '/view/LOT_2/' },
    { id: 'lot3', name: 'LOT 3', basePath: '/view/LOT_3_TNEB/' },
    { id: 'lot4', name: 'LOT 4', basePath: '/view/LOT_4/' }
];

function Live() {
    const { lotId, fileName } = useParams();
    const navigate = useNavigate();

    const [expandedLot, setExpandedLot] = useState(null);
    const [lotFiles, setLotFiles] = useState({}); // { lotId: [file1, file2] }
    const [mapData, setMapData] = useState([]); // [{lat, lng, ...row}]
    const [mapBounds, setMapBounds] = useState(null);
    const [isLoadingMap, setIsLoadingMap] = useState(false);
    const [mapStats, setMapStats] = useState({ totalPoints: 0, totalLength: 0 });
    const [segments, setSegments] = useState([]);

    // Fetch file list when a lot is expanded (Review mode)
    useEffect(() => {
        if (expandedLot && !lotFiles[expandedLot]) {
            const lot = updatedLots.find(l => l.id === expandedLot);
            if (lot) {
                fetch(`${lot.basePath}index.txt?${Date.now()}`)
                    .then(res => {
                        if (!res.ok) throw new Error("Index file not found");
                        return res.text();
                    })
                    .then(text => {
                        const files = text
                            .split('\n')
                            .map(line => line.trim())
                            .filter(line => line.length > 0 && line.toLowerCase().endsWith('.csv'))
                            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

                        setLotFiles(prev => ({ ...prev, [expandedLot]: files }));
                    })
                    .catch(err => {
                        console.error("Error fetching file list:", err);
                        setLotFiles(prev => ({ ...prev, [expandedLot]: [] }));
                    });
            }
        }
    }, [expandedLot, lotFiles]);

    // Handle deep linking or direct file selection
    useEffect(() => {
        if (lotId && fileName) {
            const lot = updatedLots.find(l => l.id === lotId);
            if (lot) {
                const fileUrl = `${lot.basePath}${fileName}`;
                setIsLoadingMap(true);

                Papa.parse(fileUrl, {
                    download: true,
                    header: true,
                    skipEmptyLines: true,
                    transformHeader: (h) => h.trim(),
                    complete: (results) => {
                        const points = results.data
                            .filter(row => row.Latitude && row.Longitude)
                            .map(row => ({
                                lat: parseFloat(row.Latitude),
                                lng: parseFloat(row.Longitude),
                                ...row
                            }))
                            .filter(pt => !isNaN(pt.lat) && !isNaN(pt.lng));

                        if (points.length > 0) {
                            setMapData(points);
                            // Calculate bounds
                            const bounds = L.latLngBounds(points.map(pt => [pt.lat, pt.lng]));
                            setMapBounds(bounds);

                            // Calculate stats and segments
                            let totalDist = 0;
                            const newSegments = [];
                            for (let i = 0; i < points.length - 1; i++) {
                                const p1 = points[i];
                                const p2 = points[i + 1];
                                const dist = calculateDistance(p1.lat, p1.lng, p2.lat, p2.lng);
                                totalDist += dist;

                                newSegments.push({
                                    pos: [(p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2],
                                    dist: Math.round(dist) + 'm'
                                });
                            }
                            setMapStats({ totalPoints: points.length, totalLength: totalDist });
                            setSegments(newSegments);

                        } else {
                            setMapData([]);
                        }
                        setIsLoadingMap(false);
                    },
                    error: (err) => {
                        console.error("CSV Parse Error:", err);
                        setIsLoadingMap(false);
                    }
                });
            }
        } else {
            setMapData([]);
        }
    }, [lotId, fileName]);

    const handleFileClick = (filename, lotId) => {
        navigate(`/live/${lotId}/${filename}`);
    };

    const handleBack = () => {
        navigate('/live');
    };

    // MAP VIEW
    if (lotId && fileName) {
        const lot = updatedLots.find(l => l.id === lotId);
        const fileUrl = lot ? `${lot.basePath}${fileName}` : '#';

        const formatLength = (meters) => {
            if (meters >= 1000) return (meters / 1000).toFixed(2) + ' km';
            return Math.round(meters) + ' m';
        };

        return (
            <div className="h-[calc(100vh-4rem)] flex flex-col">
                {/* Map Header */}
                <div className="bg-white p-3 shadow-md z-10 flex flex-col border-b border-gray-200">
                    <div className="flex justify-between items-center w-full mb-2">
                        <div className="flex items-center flex-1 min-w-0 mr-4">
                            <button
                                onClick={handleBack}
                                className="mr-3 p-2 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
                                title="Back to List"
                            >
                                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </button>
                            <h2 className="text-sm font-bold text-gray-800 truncate" title={fileName}>
                                {fileName}
                            </h2>
                        </div>
                        <div>
                            <a
                                href={fileUrl}
                                className="text-xs font-semibold text-primary-blue hover:text-blue-800 hover:underline px-3 py-1 rounded border border-transparent hover:border-blue-100 transition-all whitespace-nowrap"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Download Original
                            </a>
                        </div>
                    </div>
                    {/* Abstract / Stats */}
                    <div className="flex space-x-6 px-12 text-xs text-gray-600">
                        <div>
                            <span className="font-semibold text-gray-800">Points:</span> {mapStats.totalPoints}
                        </div>
                        <div>
                            <span className="font-semibold text-gray-800">Total Length:</span> {formatLength(mapStats.totalLength)}
                        </div>
                    </div>
                </div>

                {/* Map Container */}
                <div className="flex-grow relative bg-gray-100">
                    {isLoadingMap && (
                        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white bg-opacity-75">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-blue"></div>
                        </div>
                    )}

                    {mapData.length > 0 && mapBounds && (
                        <MapContainer
                            key={`${lotId}-${fileName}`} // Force re-mount on file change
                            bounds={mapBounds}
                            style={{ height: "100%", width: "100%" }}
                        >
                            {/* Google Hybrid Tiles */}
                            <TileLayer
                                url="http://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}"
                                maxZoom={22}
                                subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                                attribution='&copy; <a href="https://www.google.com/maps">Google Maps</a>'
                            />

                            {/* Polyline - Rendered first to act as background layer */}
                            <Polyline
                                positions={mapData.map(pt => [pt.lat, pt.lng])}
                                color="#FFD700" // Gold
                                weight={2}
                                opacity={0.8}
                            />

                            {/* Circle Markers - Rendered last to appear on top */}
                            {mapData.map((pt, idx) => {
                                const label = (pt['Tower No.'] && pt['Tower No.'].trim()) ? pt['Tower No.'] : (pt['S.No'] || (idx + 1));
                                return (
                                    <CircleMarker
                                        key={idx}
                                        center={[pt.lat, pt.lng]}
                                        radius={4}
                                        pathOptions={{ color: 'red', fillColor: '#f03', fillOpacity: 0.9, weight: 1 }}
                                    >
                                        <Popup>
                                            <div className="text-xs leading-tight">
                                                <strong className="block mb-1 border-b pb-1">{label}</strong>
                                                <span className="block text-gray-600">Pt: {pt['S.No'] || idx + 1}</span>
                                                <span className="block font-mono mt-1">{pt.lat.toFixed(6)}, {pt.lng.toFixed(6)}</span>
                                                {pt.Description && <span className="block mt-1 italic text-gray-500">{pt.Description}</span>}
                                            </div>
                                        </Popup>
                                        <Tooltip permanent direction="top" offset={[0, -5]} opacity={0.9} className="text-xs font-bold bg-transparent border-0 shadow-none text-white text-shadow-sm">
                                            {label}
                                        </Tooltip>
                                    </CircleMarker>
                                );
                            })}

                            {/* Segment Distance Labels */}
                            {segments.map((seg, idx) => (
                                <Marker
                                    key={`seg-${idx}`}
                                    position={seg.pos}
                                    icon={L.divIcon({
                                        className: 'bg-white px-1 rounded shadow text-[10px] font-mono border border-gray-300 whitespace-nowrap opacity-80',
                                        html: seg.dist,
                                        iconSize: [null, null] // Auto size
                                    })}
                                >
                                </Marker>
                            ))}

                        </MapContainer>
                    )}
                    {!isLoadingMap && mapData.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                            No valid map data found in this file.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // LIST VIEW
    return (
        <div className="min-h-[calc(100vh-4rem)] bg-gray-50 flex justify-center p-8">
            <div className="w-full max-w-4xl bg-white rounded-xl shadow-lg p-8">
                <h1 className="text-3xl font-bold text-center text-primary-blue mb-8">Survey Viewer</h1>

                <div className="space-y-4">
                    {updatedLots.map((lot) => (
                        <div key={lot.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                            <button
                                onClick={() => setExpandedLot(expandedLot === lot.id ? null : lot.id)}
                                className="w-full px-6 py-4 flex justify-between items-center text-left bg-white hover:bg-gray-50 transition-colors focus:outline-none"
                            >
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-800">{lot.name}</h3>
                                    <p className="text-sm text-gray-500">View files from {lot.basePath}</p>
                                </div>
                                <svg
                                    className={`w-5 h-5 text-gray-500 transform transition-transform ${expandedLot === lot.id ? 'rotate-180' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {/* Collapsible Content */}
                            {expandedLot === lot.id && (
                                <div className="border-t border-gray-100 bg-gray-50 p-4">
                                    {lotFiles[lot.id] ? (
                                        lotFiles[lot.id].length > 0 ? (
                                            <ul className="space-y-2">
                                                {lotFiles[lot.id].map((file, idx) => (
                                                    <li key={idx} className="flex items-center justify-between p-2 hover:bg-gray-100 rounded-lg transition-colors group">
                                                        <div className="flex items-center text-gray-700 overflow-hidden">
                                                            <svg className="w-5 h-5 mr-3 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            <span className="truncate" title={file}>{file}</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleFileClick(file, lot.id)}
                                                            className="ml-4 py-1 px-3 bg-white border border-primary-blue text-primary-blue text-xs font-semibold rounded hover:bg-primary-blue hover:text-white transition-colors flex-shrink-0"
                                                        >
                                                            View
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-gray-500 italic">No CSV files found in this lot.</p>
                                        )
                                    ) : (
                                        <div className="flex justify-center py-4">
                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-blue"></div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default Live;
