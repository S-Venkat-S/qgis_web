import * as XLSX from 'xlsx';
import { dms2dec, utm_to_latlong } from './geoUtils';

const MAX_LINES = 500;
const LINE_GEOM_INDEX = 50; // Column index for LINESTRING (1-based)

/**
 * Identifies the header row and column indices for Latitude and Longitude.
 * Returns an object {latCol: 1-based index, longCol: 1-based index, headerRow: 1-based index}
 */
export function checkLatLongColumn(sheet) {
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

    // Search first 9 rows and first 26 columns
    for (let r = 0; r < Math.min(data.length, 9); r++) {
        const row = data[r];
        for (let c = 0; c < Math.min(row.length, 26); c++) {
            const latCell = String(row[c] || '').toLowerCase().trim();
            const longCell = String(row[c + 1] || '').toLowerCase().trim();
            const prevLongCell = String(row[c - 1] || '').toLowerCase().trim();

            // Check for (Lat, Lon) or (X, Y)
            if ((latCell.startsWith("lat") && longCell.startsWith("lon")) ||
                (latCell === "x" && longCell === "y")) {
                return { latCol: c + 1, longCol: c + 2, headerRow: r + 1 };
            }
            // Check for (Lon, Lat) or (Y, X)
            if ((latCell.startsWith("lat") && prevLongCell.startsWith("lon")) ||
                (latCell === "x" && prevLongCell === "y")) {
                return { latCol: c + 1, longCol: c, headerRow: r + 1 };
            }
        }
    }
    throw new Error("Couldn't find the Lat & Long column in the first 9 rows (looking for 'LAT/LON' or 'X/Y').");
}

/**
 * Determines the coordinate type (DMS, 44p/UTM, or DD).
 */
export function checkCoordinateType(latValue, longValue) {
    const lat = String(latValue || '').trim();
    const long = String(longValue || '').trim();

    if (lat.includes('°') || lat.includes('˚') || long.includes('°') || long.includes('˚')) {
        return "DMS";
    }

    const numLat = parseFloat(latValue);
    const numLong = parseFloat(longValue);

    if (!isNaN(numLat) && !isNaN(numLong) && (numLat > 100000 && numLong > 1000000)) {
        return "44p"; // Assume UTM
    }

    return "DD"; // Decimal Degrees
}

/**
 * Converts coordinates in the designated columns for the entire sheet.
 */
export function convertCoordinates(sheetData, latCol, longCol, coordinateType) {
    let blank = 0;
    for (let i = 1; i < Math.min(sheetData.length, MAX_LINES); i++) {
        let row = sheetData[i];
        let latValue = row[latCol - 1]; // 0-based column index
        let longValue = row[longCol - 1];

        if (latValue || longValue) {
            blank = 0;
            if (coordinateType === "DMS") {
                row[latCol - 1] = dms2dec(latValue);
                row[longCol - 1] = dms2dec(longValue);
            } else if (coordinateType === "44p") {
                const dd = utm_to_latlong(parseFloat(latValue), parseFloat(longValue));
                row[latCol - 1] = dd[0];
                row[longCol - 1] = dd[1];
            }
        } else {
            blank += 1;
        }

        if (blank >= 5) {
            // Truncate the array at the blank row limit
            sheetData.splice(i);
            break;
        }
    }
    return sheetData;
}

/**
 * Swaps Lat/Long column headers if Lat > Long (assuming Lat is the larger number in DD format which is weird for India but matches original Logic).
 * Wait, original logic: Lat > Long. 
 * India: Lat ~8-37, Long ~68-97. So Long > Lat usually. 
 * Original Code: `if (latCandidate > longCandidate)` -> Swap.
 * If Lat > Long (e.g. 80, 12), then it thinks 80 is Longitude?
 * Example: Lat 12, Long 80. 12 < 80. Not swapped. Correct.
 * Example: Input Column 1=80, Column 2=12. 80 > 12. Swap. Col 1 becomes Longitude, Col 2 became Latitude. Correct.
 */
export function swapLatLong(sheetData, col1, col2) {
    const latCandidate = parseFloat(sheetData[1][col1 - 1]);
    const longCandidate = parseFloat(sheetData[1][col2 - 1]);

    if (!isNaN(latCandidate) && !isNaN(longCandidate) && latCandidate > longCandidate) {
        // Swap Headers (first row, index 0)
        [sheetData[0][col1 - 1], sheetData[0][col2 - 1]] = ["Longitude", "Latitude"];
        return { sheetData: sheetData, isSwapped: true };
    }

    // Ensure headers are set to Latitude/Longitude if they were X/Y before
    if (String(sheetData[0][col1 - 1]).toLowerCase() === "x" && String(sheetData[0][col2 - 1]).toLowerCase() === "y") {
        sheetData[0][col1 - 1] = "Latitude";
        sheetData[0][col2 - 1] = "Longitude";
    }
    return { sheetData: sheetData, isSwapped: false };
}

/**
 * Standardizes headers for Latitude, Longitude, Tower_No and Joint_Box.
 * Removes any pre-existing geometry columns to ensure the CSV is dynamic and de-duplicated.
 */
export function addLineGeom(sheetData, latCol, longCol) {
    let blank = 0;

    // 1. Standardize Headers
    const headers = sheetData[0];
    for (let c = 0; c < headers.length; c++) {
        const h = String(headers[c] || '').toLowerCase().replace(/[^a-z]/g, '');
        if (h === 'towerno' || h === 'tno') headers[c] = 'Tower_No';
        if (h === 'jointbox' || h === 'jb') headers[c] = 'Joint_Box';
        if (h === 'latitude' || h === 'lat') headers[c] = 'Latitude';
        if (h === 'longitude' || h === 'lng' || h === 'long' || h === 'lon') headers[c] = 'Longitude';
    }

    // 2. Iterate through data rows to clean up and unify
    for (let i = 1; i < Math.min(sheetData.length, MAX_LINES); i++) {
        const row = sheetData[i];
        const lat = row[latCol - 1];
        const lng = row[longCol - 1];

        if (lat || lng) {
            blank = 0;
            // Rows are preserved as a clean coordinate list
        } else {
            blank += 1;
        }

        if (blank >= 5) break;
    }

    // ─── OPTIMIZATION: Remove entirely empty columns ───────────
    const numCols = sheetData[0].length;
    const activeColIndices = [];
    for (let c = 0; c < numCols; c++) {
        let hasValue = false;
        for (let r = 0; r < sheetData.length; r++) {
            const val = sheetData[r][c];
            if (val !== null && val !== undefined && String(val).trim() !== "") {
                hasValue = true;
                break;
            }
        }
        if (hasValue) activeColIndices.push(c);
    }

    // Map each row to only include active columns
    return sheetData.map(row => activeColIndices.map(idx => row[idx]));
}

/**
 * Converts array of arrays to CSV string.
 */
export function sheetDataToCsv(data) {
    const csvContent = data.map(e => e.map(item => {
        let value = (item === null || item === undefined) ? "" : String(item).replace(/"/g, '""');
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            value = `"${value}"`;
        }
        return value;
    }).join(",")).join("\n");
    return csvContent;
}

/**
 * Processes a single file buffer.
 * @param {ArrayBuffer} arrayBuffer 
 * @param {string} fileName 
 */
export async function processExcelFile(arrayBuffer, fileName) {
    try {
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellStyles: true, cellDates: true });

        // 1. Get Survey Sheet Name
        const surveySheetName = workbook.SheetNames.find(name => name.toLowerCase().includes("survey"));
        if (!surveySheetName) {
            throw new Error("Survey sheet not found. Sheet name must contain 'survey'.");
        }

        const worksheet = workbook.Sheets[surveySheetName];

        // Get full sheet data
        let fullSheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

        // 2. Find Lat/Long Columns and Header Row
        const { latCol, longCol, headerRow } = checkLatLongColumn(worksheet);

        // --- NEW HEADER MERGE LOGIC ---
        const upperHeaderRowIndex = headerRow - 2; // 0-based
        const currentHeaderRowIndex = headerRow - 1; // 0-based

        if (upperHeaderRowIndex >= 0 && fullSheetData.length > currentHeaderRowIndex) {
            const upperHeaderRow = fullSheetData[upperHeaderRowIndex];
            const currentHeaderRow = fullSheetData[currentHeaderRowIndex];

            for (let c = 0; c < upperHeaderRow.length; c++) {
                const valueToCopy = String(upperHeaderRow[c] || '').trim();
                const currentCol = c + 1; // 1-based index

                if (currentCol !== latCol && currentCol !== longCol && currentCol !== LINE_GEOM_INDEX) {
                    if (!currentHeaderRow[c] && valueToCopy) {
                        currentHeaderRow[c] = valueToCopy;
                    }
                }
            }
        }

        // 3. Slice the data
        let sheetData = fullSheetData.slice(currentHeaderRowIndex);

        if (sheetData.length < 2) {
            throw new Error("No data found below the identified header row.");
        }

        const coordinatesSystem = checkCoordinateType(
            sheetData[1][latCol - 1],
            sheetData[1][longCol - 1]
        );

        // 5. Convert Coordinates
        if (coordinatesSystem !== "DD") {
            sheetData = convertCoordinates(sheetData, latCol, longCol, coordinatesSystem);
        }

        // 6. Swap Lat/Long
        const { sheetData: swappedData, isSwapped } = swapLatLong(sheetData, latCol, longCol);
        sheetData = swappedData;

        const finalLatCol = isSwapped ? longCol : latCol;
        const finalLongCol = isSwapped ? latCol : longCol;

        // 7. Add LINESTRING
        sheetData = addLineGeom(sheetData, finalLatCol, finalLongCol);

        // 8. Generate CSV
        const csvContent = sheetDataToCsv(sheetData);

        return {
            originalName: fileName,
            csvName: fileName.replace(/\.(xlsx|xls)$/i, '.csv'),
            csvContent: csvContent,
            coordinatesSystem: coordinatesSystem
        };

    } catch (error) {
        throw new Error(error.message);
    }
}
