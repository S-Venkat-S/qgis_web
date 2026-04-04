import csv
import re
import os
import argparse
import math

def haversine(lat1, lon1, lat2, lon2):
    """Calculate the great circle distance in meters between two points."""
    R = 6371000 # Radius of Earth in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1-a))

def dms_to_dd(dms_str):
    """Convert DMS string or numeric string to Decimal Degrees."""
    if not dms_str: return None
    if isinstance(dms_str, (int, float)): return float(dms_str)
    
    dms_str = str(dms_str).strip()
    
    # Case 1: Simple float (e.g. "12.4546")
    try:
        return float(dms_str)
    except ValueError:
        pass
        
    # Case 2: DMS format (e.g. 12°24'43.8" or 12d 24m 43.8s)
    # Matches: [degrees] [°d] [minutes] ['m] [seconds] ["s]
    match = re.search(r'(\d+)\s*[°d]?\s*(\d+)\s*[\'m]?\s*([\d.]+)\s*["s]?', dms_str, re.IGNORECASE)
    if match:
        try:
            degrees = float(match.group(1))
            minutes = float(match.group(2))
            seconds = float(match.group(3))
            dd = degrees + (minutes / 60) + (seconds / 3600)
            
            # Simple handling for South/West if symbols present (not in example but good practice)
            if any(c in dms_str.upper() for c in ['S', 'W']):
                dd = -dd
            return dd
        except:
            pass
            
    return None

def parse_wkt_point(wkt):
    """Extract lat, lng from Point (LNG LAT) string."""
    if not wkt: return None, None
    match = re.search(r'POINT\s*\((.*?)\)', wkt, re.IGNORECASE)
    if match:
        coords = match.group(1).strip().split()
        if len(coords) >= 2:
            try:
                return float(coords[1]), float(coords[0]) # lat, lng
            except:
                pass
    return None, None

def load_master_stations(master_csv_path):
    stations = []
    try:
        with open(master_csv_path, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get('ss_name', '').strip()
                if not name:
                    continue
                
                lat, lng = parse_wkt_point(row.get('wkt_geom', ''))
                if lat is None or lng is None:
                    continue

                stations.append({
                    'ss_name': name,
                    'volt_ratio': row.get('volt_ratio', ''),
                    'ss_code': row['ss_code'],
                    'ss_type': row.get('ss_type', '').upper(),
                    'lat': lat,
                    'lng': lng
                })
    except Exception as e:
        print(f"Error loading master CSV: {e}")
    return stations

def find_nearest_station(query_lat, query_lng, master_stations):
    if not master_stations: return None
    
    best_match = None
    min_dist = float('inf')
    
    for s in master_stations:
        dist = haversine(query_lat, query_lng, s['lat'], s['lng'])
        if dist < min_dist:
            min_dist = dist
            best_match = s
            
    if best_match:
        # Create a copy and add distance
        res = best_match.copy()
        res['distance'] = min_dist
        return res
    return None

def update_ss_list_by_coords(input_file, master_stations):
    output_rows = []
    updated_count = 0
    
    try:
        with open(input_file, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            fieldnames = list(reader.fieldnames)
            
            # Ensure required result columns exist
            for col in ['ss_code', 'name', 'volt_ratio', 'dist_m']:
                if col not in fieldnames:
                    fieldnames.append(col)
            
            for row in reader:
                # Try to get lat/long from various possible column names
                lat_raw = row.get('lat') or row.get('latitude') or row.get('LAT')
                lng_raw = row.get('long') or row.get('longitude') or row.get('lng') or row.get('LNG') or row.get('LONG') or row.get('lon') or row.get('LON')
                
                lat = dms_to_dd(lat_raw)
                lng = dms_to_dd(lng_raw)
                
                if lat is not None and lng is not None:
                    match = find_nearest_station(lat, lng, master_stations)
                    if match:
                        row['ss_code'] = match['ss_code']
                        row['name'] = match['ss_name']
                        row['volt_ratio'] = match['volt_ratio']
                        row['dist_m'] = round(match['distance'], 2)
                        updated_count += 1
                    else:
                        row['ss_code'] = 'NOT FOUND'
                else:
                    row['ss_code'] = 'INVALID COORDS'
                    
                output_rows.append(row)
        
        # Write back to the same file
        with open(input_file, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(output_rows)
            
        print(f"Updated {updated_count} / {len(output_rows)} rows in {input_file} based on coordinates.")
        
        # Print codes split in half
        codes = [row['ss_code'] for row in output_rows if row['ss_code'] not in ['NOT FOUND', 'INVALID COORDS', 'MISSING COORDS']]
        if codes:
            half = (len(codes) + 1) // 2
            part1 = ", ".join(codes[:half])
            part2 = ", ".join(codes[half:])
            print(f"\n[{part1}],[{part2}]")
            
    except Exception as e:
        print(f"Error updating CSV: {e}")

def main():
    parser = argparse.ArgumentParser(description="Find nearest ss_code based on coordinates.")
    parser.add_argument("input_file", help="CSV file to update (must have lat/long columns)")
    parser.add_argument("--master", default="public/view/All Sub Station.csv", help="Master substation CSV")
    args = parser.parse_args()

    if not os.path.exists(args.master):
        print(f"Master file not found: {args.master}")
        return

    master_stations = load_master_stations(args.master)
    print(f"Loaded {len(master_stations)} stations from master.")

    update_ss_list_by_coords(args.input_file, master_stations)

if __name__ == "__main__":
    main()
