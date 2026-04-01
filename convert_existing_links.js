import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Paths ────────────────────────────────────────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, 'public');
const MASTER_CSV = path.join(PUBLIC_DIR, 'existing_links_master.csv');
const SS_CSV = path.join(PUBLIC_DIR, 'view', 'All Sub Station.csv');
const OUTPUT_DIR = path.join(PUBLIC_DIR, 'view', 'EXISTING');

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseWktPoint(wkt) {
    if (!wkt) return [null, null];
    const match = wkt.match(/Point\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)/i);
    if (match) {
        return [parseFloat(match[1]), parseFloat(match[2])];
    }
    return [null, null];
}

function getProjectionInfo(a, b, t) {
    const [x1, y1] = a;
    const [x2, y2] = b;
    const [x3, y3] = t;

    const dx = x2 - x1;
    const dy = y2 - y1;

    const d2 = dx * dx + dy * dy;
    if (d2 === 0) {
        return [x1, y1, 0.0];
    }

    const t_dot = ((x3 - x1) * dx + (y3 - y1) * dy) / d2;
    const xp = x1 + t_dot * dx;
    const yp = y1 + t_dot * dy;
    return [xp, yp, t_dot];
}

function loadSubstations(ssCsvPath) {
    const csvData = fs.readFileSync(ssCsvPath, 'utf8');
    const { data } = Papa.parse(csvData, { header: true, skipEmptyLines: true });
    
    const lookup = {};
    for (const row of data) {
        const nameRaw = row.ss_name || row.name;
        const wkt = row.wkt_geom;
        const voltRatio = row.volt_ratio || "";
        if (!nameRaw || !wkt) continue;

        const [lon, lat] = parseWktPoint(wkt);
        if (lon === null) continue;

        const key = nameRaw.trim().toUpperCase();
        if (!lookup[key]) {
            lookup[key] = [];
        }

        // Extract high voltage from volt_ratio (e.g., "400/230" -> 400)
        let highVolt = 0;
        const voltMatch = voltRatio.match(/(\d+)/);
        if (voltMatch) {
            highVolt = parseInt(voltMatch[1]);
        }

        lookup[key].push({
            coords: [lon, lat],
            volt: highVolt,
            voltRatio: voltRatio
        });
    }

    // Sort each list by voltage descending so the highest is first by default
    for (const key in lookup) {
        lookup[key].sort((a, b) => b.volt - a.volt);
    }
    return lookup;
}

// Simple similarity helper (Levenshtein based)
function editDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else {
                if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

function similarity(s1, s2) {
    let longer = s1;
    let shorter = s2;
    if (s1.length < s2.length) {
        longer = s2;
        shorter = s1;
    }
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function findCoords(name, lookup) {
    const originalName = name.trim();

    // 0. Check for inline coordinates (Lat, Lon) or (Lon, Lat)
    // Format: (8.9201668839999, 78.0607148632407)
    const coordMatch = originalName.match(/\(?\s*([-+]?\d+\.\d+)\s*[,\s]\s*([-+]?\d+\.\d+)\s*\)?/);
    if (coordMatch) {
        const val1 = parseFloat(coordMatch[1]);
        const val2 = parseFloat(coordMatch[2]);
        // Simple heuristic for India: Longitude (70-90) is greater than Latitude (8-35)
        if (Math.abs(val2) > Math.abs(val1)) {
            return { coords: [val2, val1], score: 1.0, matchedName: originalName };
        } else {
            return { coords: [val1, val2], score: 1.0, matchedName: originalName };
        }
    }

    const key = originalName.toUpperCase();
    
    // Extract potential voltage mention from input name (e.g. "400 Kayathar" -> 400)
    let searchVolt = null;
    const voltMatch = originalName.match(/(765|400|230|110|33|22|11)/);
    if (voltMatch) {
        searchVolt = parseInt(voltMatch[1]);
    }

    // Create a version of the key without the voltage for better name matching
    let cleanKey = key;
    if (searchVolt) {
        cleanKey = key.replace(searchVolt.toString(), "").replace(/\s+/g, " ").trim();
    }

    // 1. Direct match with searchVolt preference
    if (lookup[key]) {
        if (searchVolt) {
            const match = lookup[key].find(v => v.volt === searchVolt || v.voltRatio.includes(searchVolt.toString()));
            if (match) return { coords: match.coords, score: 1.0, matchedName: key };
        }
        return { coords: lookup[key][0].coords, score: 1.0, matchedName: key }; 
    }
    
    // 2. Clean key match with searchVolt preference
    if (searchVolt && lookup[cleanKey]) {
        const match = lookup[cleanKey].find(v => v.volt === searchVolt || v.voltRatio.includes(searchVolt.toString()));
        if (match) return { coords: match.coords, score: 1.0, matchedName: cleanKey };
    } else if (!searchVolt && lookup[cleanKey]) {
        return { coords: lookup[cleanKey][0].coords, score: 1.0, matchedName: cleanKey };
    }

    let bestMatch = null;
    let bestScore = -1.0;
    let rawSimilarity = 0;
    let matchedName = "";

    for (const [k, variations] of Object.entries(lookup)) {
        // Check similarity against both the full key and the clean key
        let scoreFull = similarity(key, k);
        let scoreClean = searchVolt ? similarity(cleanKey, k) : -1;
        let baseScore = Math.max(scoreFull, scoreClean);

        // Substring boost
        if (k.includes(key) || key.includes(k) || (searchVolt && (k.includes(cleanKey) || cleanKey.includes(k)))) {
            baseScore += 0.2;
        }

        if (baseScore > 0.4) {
            for (const v of variations) {
                let currentScore = baseScore;
                
                // Boost if voltage matches
                if (searchVolt && (v.volt === searchVolt || v.voltRatio.includes(searchVolt.toString()))) {
                    currentScore += 0.4;
                } else if (!searchVolt) {
                    currentScore += (v.volt / 10000.0);
                }

                if (currentScore > bestScore) {
                    bestScore = currentScore;
                    bestMatch = v.coords;
                    rawSimilarity = baseScore;
                    matchedName = k;
                }
            }
        }
    }

    if (bestMatch && bestScore > 0.45) {
        return { 
            coords: bestMatch, 
            score: Math.min(0.99, rawSimilarity),
            matchedName: matchedName
        };
    }

    return { coords: [null, null], score: 0, matchedName: "" };
}

function safeFilename(text, maxLen = 120) {
    let s = text.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
    s = s.trim().replace(/\.+$/, "");
    return s.length > maxLen ? s.substring(0, maxLen) : s;
}

function writeLinkCsv(filepath, points, name) {
    if (points.length < 2) {
        console.log(`  ⚠  Skipping '${name}' – fewer than 2 coords resolved`);
        return false;
    }
// ... (rest of function unchanged, assuming replacement block needs to be self-contained or I use multi-replace)

    const rows = [["S.No", "Station", "Latitude", "Longitude", "line_geom"]];
    for (let i = 0; i < points.length; i++) {
        const [lon, lat, label] = points[i];
        if (i === 0) {
            rows.push([i + 1, label, lat, lon, ""]);
        } else {
            const [prevLon, prevLat] = points[i - 1];
            const linestring = `LINESTRING(${prevLon} ${prevLat}, ${lon} ${lat})`;
            rows.push([i + 1, label, lat, lon, linestring]);
        }
    }

    const csvContent = Papa.unparse(rows);
    fs.writeFileSync(filepath, csvContent, 'utf8');
    return true;
}

function parseLinkName(name) {
    name = name.trim();
    // Use a regex that splits by "-" but ignores those inside parentheses
    const smartSplit = (s) => s.split(/\s*-\s*(?![^(]*\))/).map(p => p.trim()).filter(p => p.length > 0);

    if (name.includes("|")) {
        const parts = name.split("|").map(p => p.trim());
        const mainPart = parts[0];
        const liloPoints = parts.slice(1).filter(p => p.length > 0);

        const dashParts = smartSplit(mainPart);
        if (dashParts.length >= 2) {
            const ssA = dashParts[0];
            const ssB = dashParts[dashParts.length - 1]; // Use last as B
            const middle = dashParts.slice(1, -1);
            return ["LILO", name, { ssA, ssB, taps: [...middle, ...liloPoints] }];
        } else {
            return ["DIRECT", name, dashParts];
        }
    } else {
        const stations = smartSplit(name);
        return ["DIRECT", name, stations];
    }
}

function convert(masterCsvPath, ssCsvPath, outputDir) {
    console.log(`Loading substations from: ${ssCsvPath}`);
    if (!fs.existsSync(ssCsvPath)) {
        console.error(`ERROR: File not found → ${ssCsvPath}`);
        process.exit(1);
    }
    const lookup = loadSubstations(ssCsvPath);
    console.log(`  → ${Object.keys(lookup).length} substations loaded\n`);

    if (fs.existsSync(outputDir)) {
        const files = fs.readdirSync(outputDir);
        for (const file of files) {
            fs.unlinkSync(path.join(outputDir, file));
        }
        console.log(`  → Cleared existing files in: ${outputDir}`);
    } else {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    if (!fs.existsSync(masterCsvPath)) {
        console.error(`ERROR: File not found → ${masterCsvPath}`);
        process.exit(1);
    }
    const masterData = fs.readFileSync(masterCsvPath, 'utf8');
    const { data: rows } = Papa.parse(masterData, { header: true, skipEmptyLines: true });

    let total = 0;
    let skipped = 0;
    let created = 0;

    function logLowConfidence(original, matched, score) {
        if (score > 0 && score < 0.8) {
            console.log(`  ⚠  Low Confidence [${(score * 100).toFixed(1)}%]: '${original}' → matched to '${matched}'`);
        }
    }

    for (const row of rows) {
        const sl = (row.sl || '').trim();
        let name = (row.name || '').trim();
        
        // Fix unquoted coordinates with commas
        if (row.__parsed_extra && row.__parsed_extra.length > 0) {
            name += "," + row.__parsed_extra.join(",");
        }
        
        if (!name || !sl) continue;

        total++;
        const [ltype, title, ldata] = parseLinkName(name);

        let points = [];
        let minScore = 2.0;

        if (ltype === "LILO") {
            const { ssA, ssB, taps } = ldata;
            const resA = findCoords(ssA, lookup);
            const resB = findCoords(ssB, lookup);

            if (resA.coords[0] !== null && resB.coords[0] !== null) {
                logLowConfidence(ssA, resA.matchedName, resA.score);
                logLowConfidence(ssB, resB.matchedName, resB.score);
                
                minScore = Math.min(minScore, resA.score, resB.score);
                points.push([...resA.coords, ssA]);

                const tapData = [];
                for (const lp of taps) {
                    const resT = findCoords(lp, lookup);
                    if (resT.coords[0] !== null) {
                        logLowConfidence(lp, resT.matchedName, resT.score);
                        minScore = Math.min(minScore, resT.score);
                        const [px, py, pt] = getProjectionInfo(resA.coords, resB.coords, resT.coords);
                        tapData.push({
                            coord: resT.coords,
                            proj: [px, py],
                            name: lp,
                            t: pt
                        });
                    } else {
                        minScore = 0;
                    }
                }

                tapData.sort((a, b) => a.t - b.t);

                for (const td of tapData) {
                    points.push([td.proj[0], td.proj[1], `TAP on ${ssA}-${ssB}`]);
                    points.push([td.coord[0], td.coord[1], td.name]);
                    points.push([td.proj[0], td.proj[1], `TAP on ${ssA}-${ssB}`]);
                }

                points.push([...resB.coords, ssB]);
            } else {
                minScore = 0;
                const missing = [];
                if (resA.coords[0] === null) missing.push(ssA);
                if (resB.coords[0] === null) missing.push(ssB);
                console.log(`[${sl}] '${title}' – endpoints NOT FOUND for LILO: ${missing.join(', ')}`);
            }
        } else {
            // DIRECT
            const stationNames = ldata;
            const missing = [];
            for (const sname of stationNames) {
                const res = findCoords(sname, lookup);
                if (res.coords[0] === null) {
                    missing.push(sname);
                    minScore = 0;
                } else {
                    logLowConfidence(sname, res.matchedName, res.score);
                    minScore = Math.min(minScore, res.score);
                }
                points.push([...res.coords, sname]);
            }
            if (missing.length > 0) {
                console.log(`[${sl}] '${title}' – coords NOT FOUND for: ${missing.join(', ')}`);
            }
        }

        const validPoints = points.filter(p => p[0] !== null);
        
        if (minScore < 0.8) {
            console.log(`  ⚠  Skipping '[${sl}] ${title}' – confidence below 80% (${(minScore * 100).toFixed(1)}%)`);
            skipped++;
            continue;
        }

        const fname = `EXISTING E-${sl} - ${safeFilename(title)}.csv`;
        const fpath = path.join(outputDir, fname);

        const ok = writeLinkCsv(fpath, validPoints, title);
        if (ok) {
            created++;
            console.log(`[${sl}] ✓ Created: ${fname}`);
        } else {
            skipped++;
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Done.  Total links: ${total}  |  Files created: ${created}  |  Skipped: ${skipped}`);
    console.log(`Output directory: ${outputDir}`);
}

// ── Entry point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let masterCsv = MASTER_CSV;
let ssCsv = SS_CSV;
let outputDir = OUTPUT_DIR;

if (args.length === 3) {
    masterCsv = path.resolve(args[0]);
    ssCsv = path.resolve(args[1]);
    outputDir = path.resolve(args[2]);
} else if (args.length !== 0) {
    console.log("Usage: node convert_existing_links.js [master.csv substation.csv output_dir]");
    process.exit(1);
}

convert(masterCsv, ssCsv, outputDir);
