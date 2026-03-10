/**
 * Converts DMS string to Decimal Degrees.
 * @param {string} dms 
 * @returns {number|string}
 */
export function dms2dec(dms) {
    if (typeof dms !== 'string') return dms;
    const parts = dms.match(/(\d+)\D*(\d+)\D*([\d.]+)\D*([NSEW])?/i);
    if (!parts) return null;

    const degrees = parseFloat(parts[1]);
    const minutes = parseFloat(parts[2]);
    const seconds = parseFloat(parts[3]);
    const direction = parts[4] ? parts[4].toUpperCase() : '';

    let decimal = degrees + (minutes / 60) + (seconds / 3600);

    if (direction === 'S' || direction === 'W' || (direction === '' && decimal < 0)) {
        decimal *= -1;
    }
    return decimal;
}

/**
 * Converts UTM coordinates to Latitude and Longitude (Decimal Degrees).
 * NOTE: This is a simplified mock implementation for demonstration.
 * @param {number} easting 
 * @param {number} northing 
 * @returns {[number, number]} [lat, lon]
 */
export function utm_to_latlong(easting, northing) {
    if (easting > 100000 && northing > 1000000) {
        // Mock logic: NOT mathematically accurate.
        const lat = northing / 111000 - 80;
        const lon = easting / 111000 - 180;
        return [lat, lon];
    }
    return [easting, northing];
}
