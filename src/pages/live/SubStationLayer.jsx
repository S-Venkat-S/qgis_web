import React, { useState, useEffect } from 'react';
import { CircleMarker, Tooltip, useMap, useMapEvents, Popup } from 'react-leaflet';
import Papa from 'papaparse';

const SubStationLayer = ({ showLabels = true }) => {
    const [subStations, setSubStations] = useState([]);
    const [zoomLevel, setZoomLevel] = useState(13);
    const map = useMap();

    const [visibleStations, setVisibleStations] = useState([]);

    // Track zoom and viewport for dynamic styling/filtering
    const updateVisibleStations = () => {
        const currentZoom = map.getZoom();
        setZoomLevel(currentZoom);

        if (subStations.length === 0) return;

        // If zoomed out, only show a subset or nothing to save performance
        // If zoomed in, only show what's in the current view
        const bounds = map.getBounds();
        const filtered = subStations.filter(ss => {
            // Basic viewport culling
            const isVisible = bounds.contains([ss.lat, ss.lng]);
            if (!isVisible) return false;

            // Density control: At low zoom, only show high voltage or a fraction
            if (currentZoom < 10) return false;
            if (currentZoom < 12) return ss.name.length % 5 === 0; // Show ~20%
            return true;
        });

        setVisibleStations(filtered);
    };

    useMapEvents({
        zoomend: updateVisibleStations,
        moveend: updateVisibleStations
    });

    useEffect(() => {
        // Fetch and parse the Sub Station CSV
        const csvPath = '/view/All Sub Station.csv';

        Papa.parse(csvPath, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const parsed = results.data.map(row => {
                    const wkt = row.wkt_geom || '';
                    const match = wkt.match(/Point \(([^ ]+) ([^ ]+)\)/i);
                    if (match) {
                        return {
                            name: row.ss_name || row.name || 'Unknown',
                            lat: parseFloat(match[2]),
                            lng: parseFloat(match[1]),
                            volt: row.volt_ratio,
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
    }, []); // Only fetch once on mount

    // Update visible stations when data is loaded
    useEffect(() => {
        updateVisibleStations();
    }, [subStations]);

    // Substation markers should be subtle yet readable
    // Similar to a background canvas layer
    const markerOptions = {
        radius: zoomLevel >= 15 ? 4 : 2,
        color: '#3B82F6', // Blue 500
        fillColor: '#60A5FA', // Blue 400
        fillOpacity: 0.6,
        weight: 1
    };

    return (
        <React.Fragment>
            {visibleStations.map((ss, idx) => (
                <CircleMarker
                    key={`ss-${idx}`}
                    center={[ss.lat, ss.lng]}
                    {...markerOptions}
                >
                    <Popup>
                        <div className="text-[11px] p-1">
                            <h3 className="font-bold text-blue-700 border-b mb-1 pb-1 uppercase">{ss.name}</h3>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                <span className="text-gray-400 font-bold uppercase text-[9px]">Voltage:</span>
                                <span className="font-mono text-gray-700">{ss.volt}</span>
                                <span className="text-gray-400 font-bold uppercase text-[9px]">Type:</span>
                                <span className="text-gray-700">{ss.type}</span>
                                <span className="text-gray-400 font-bold uppercase text-[9px]">Code:</span>
                                <span className="font-mono text-gray-700">{ss.code}</span>
                                <span className="text-gray-400 font-bold uppercase text-[9px]">Circle:</span>
                                <span className="text-gray-700">{ss.circle}</span>
                            </div>
                        </div>
                    </Popup>
                    {showLabels && zoomLevel >= 14 && (
                        <Tooltip
                            permanent
                            direction="top"
                            offset={[0, -5]}
                        >
                            {ss.name}
                        </Tooltip>
                    )}
                </CircleMarker>
            ))}
        </React.Fragment>
    );
};

export default SubStationLayer;
