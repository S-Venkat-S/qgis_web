import os
import csv
import argparse
import sys

def standardize_csv(file_path, dry_run=True):
    temp_file = file_path + ".tmp"
    modified = False
    
    try:
        with open(file_path, mode='r', newline='', encoding='utf-8-sig') as infile:
            reader = csv.reader(infile)
            header = next(reader, None)
            
            if header is None:
                print(f"Skipping empty file: {file_path}")
                return False

            # Find matching column for "Joint box Location" or "JOINT BOX" or "joint_box"
            target_idx = -1
            target_col_name = "JOINT BOX"
            
            # Normalize header search
            for i, col in enumerate(header):
                if col.lower().strip() in ["joint box location", "joint box", "joint_box"]:
                    target_idx = i
                    original_name = col
                    break
            
            if target_idx == -1:
                print(f"Missing 'Joint Box Location' column in: {file_path}")
                return False

            # Check if rename is needed
            if header[target_idx] != target_col_name:
                header[target_idx] = target_col_name
                modified = True

            rows = []
            for row in reader:
                if target_idx < len(row):
                    val = row[target_idx].strip().lower()
                    new_val = row[target_idx]
                    
                    if "2 way" in val or val == "2way" or val == "2 way":
                        new_val = "2W"
                    elif "3 way" in val or val == "3way" or val == "3 way":
                        new_val = "3W"
                    elif "4 way" in val or val == "4way" or val == "4 way":
                        new_val = "4W"
                    
                    if new_val != row[target_idx]:
                        row[target_idx] = new_val
                        modified = True
                rows.append(row)

            if modified:
                if dry_run:
                    print(f"[DRY-RUN] Would modify: {file_path}")
                else:
                    with open(temp_file, mode='w', newline='', encoding='utf-8') as outfile:
                        writer = csv.writer(outfile)
                        writer.writerow(header)
                        writer.writerows(rows)
                    os.replace(temp_file, file_path)
                    print(f"Modified: {file_path}")
            else:
                pass # No changes needed

    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        if os.path.exists(temp_file):
            os.remove(temp_file)
        return False
    
    return modified

def main():
    parser = argparse.ArgumentParser(description="Standardize Joint Box Data in CSV files.")
    parser.add_argument("--dir", default="public/view/LOT_2", help="Directory containing CSV files")
    parser.add_argument("--execute", action="store_true", help="Perform actual file modifications")
    args = parser.parse_args()

    target_dir = args.dir
    if not os.path.isdir(target_dir):
        print(f"Directory not found: {target_dir}")
        sys.exit(1)

    csv_files = [f for f in os.listdir(target_dir) if f.endswith(".csv")]
    
    print(f"Found {len(csv_files)} CSV files in {target_dir}")
    print("Mode: " + ("EXECUTE" if args.execute else "DRY-RUN"))
    print("-" * 40)

    modified_count = 0
    for csv_file in csv_files:
        file_path = os.path.join(target_dir, csv_file)
        if standardize_csv(file_path, dry_run=not args.execute):
            modified_count += 1

    print("-" * 40)
    if args.execute:
        print(f"Successfully modified {modified_count} files.")
    else:
        print(f"Dry-run complete. {modified_count} files would be modified.")
        print("Run with --execute to apply changes.")

if __name__ == "__main__":
    main()
