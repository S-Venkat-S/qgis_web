import csv
import re
import os
import argparse
from difflib import SequenceMatcher

def normalize_name(name):
    """Normalize substation name for matching."""
    if not name:
        return ""
    # Remove "SS", "(", ")", "Gantry", and extra spaces
    name = name.upper()
    # If the name has a voltage at the end (e.g. "Udumalpet 110"), remove it for name matching
    name = re.sub(r'\s+\d+(KV)?$', '', name)
    name = re.sub(r'\(.*?\)', '', name)  # Remove content in parentheses
    name = name.replace('SS', '').replace('GANTRY', '').replace('-', ' ')
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def extract_voltage(name):
    """Extract voltage from name if present (e.g. '110', '230', '400')."""
    match = re.search(r'(\d{2,3})(KV)?', name, re.IGNORECASE)
    if match:
        return match.group(1)
    return None

def fuzzy_ratio(a, b):
    return SequenceMatcher(None, a, b).ratio()

def load_master_stations(master_csv_path):
    stations = []
    try:
        with open(master_csv_path, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                stations.append({
                    'ss_name': row['ss_name'],
                    'volt_ratio': row.get('volt_ratio', ''),
                    'ss_code': row['ss_code'],
                    'norm_name': normalize_name(row['ss_name'])
                })
    except Exception as e:
        print(f"Error loading master CSV: {e}")
    return stations

def find_best_match(query_name, master_stations):
    norm_query = normalize_name(query_name)
    query_volt = extract_voltage(query_name)
    
    matches = []
    
    # First try exact normalized match
    matches = [s for s in master_stations if s['norm_name'] == norm_query]
    
    if not matches:
        # Try substring match
        matches = [s for s in master_stations if norm_query in s['norm_name'] or s['norm_name'] in norm_query]
    
    if not matches:
        # Try fuzzy match if still no results
        for s in master_stations:
            score = fuzzy_ratio(norm_query, s['norm_name'])
            if score > 0.8: # Threshold
                matches.append(s)
    
    if not matches:
        return None

    # If multiple matches, prioritize voltage ratio
    if len(matches) > 1 and query_volt:
        volt_matches = [m for m in matches if query_volt in m['volt_ratio']]
        if volt_matches:
            return volt_matches[0]
            
    # Return first match (or highest score if we had scores)
    return matches[0]

def update_ss_list(input_file, master_stations):
    output_rows = []
    updated_count = 0
    
    try:
        with open(input_file, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            if 'ss_code' not in fieldnames:
                fieldnames.append('ss_code')
            
            for row in reader:
                name = row['ss_name']
                match = find_best_match(name, master_stations)
                if match:
                    row['ss_code'] = match['ss_code']
                    updated_count += 1
                else:
                    row['ss_code'] = 'NOT FOUND'
                output_rows.append(row)
        
        # Write back to the same file
        with open(input_file, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(output_rows)
            
        print(f"Updated {updated_count} / {len(output_rows)} rows in {input_file}.")
    except Exception as e:
        print(f"Error updating CSV: {e}")

def main():
    parser = argparse.ArgumentParser(description="Find ss_code for substations and update CSV.")
    parser.add_argument("input_file", help="CSV file to update (must have ss_name column)")
    parser.add_argument("--master", default="public/view/All Sub Station.csv", help="Master substation CSV")
    args = parser.parse_args()

    if not os.path.exists(args.master):
        print(f"Master file not found: {args.master}")
        return

    master_stations = load_master_stations(args.master)
    print(f"Loaded {len(master_stations)} stations from master.")

    update_ss_list(args.input_file, master_stations)

if __name__ == "__main__":
    main()
