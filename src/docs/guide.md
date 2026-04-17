# Documentation & User Guide

Welcome to the **OPGW Survey Ecosystem**. This guide provides a comprehensive overview of how to use our tools to process, visualize, and manage survey data.

---

## 🚀 The Operational Workflow

To get the most out of this application, follow this standard industry workflow:

1.  **COLLECT**: Gather raw survey data in Excel (typically `.xlsx`).
2.  **PREPARE**: Ensure coordinates are in Column K & L, and data starts from Row 6.
3.  **CONVERT**: Use the [Convert Page](/convert) to transform Excel into standardized CSV.
4.  **RE-VALIDATE**: Use the [Local Viewer](/local-view) to verify the data looks correct on a map before uploading.
5.  **DEPLOY**: (Admins) Upload the CSVs to the server using the `npm run build:deploy` command.
6.  **COLLABORATE**: Share the [Live Dashboard](/live) links with engineers and stakeholders for review.
7.  **EXPORT**: Download the [QGIS Project](/live) to finalize engineering drawings.

---

## 🛠️ Data Conversion (Excel to CSV)

The converter is the heart of the "Bridge" between Excel surveys and GIS.

### **Prerequisites for Success**
1.  **Format**: Files must be `.xlsx`.
2.  **Column Alignment**: 
    - **Latitude**: Must be in **Column K**.
    - **Longitude**: Must be in **Column L**.
3.  **Data Start**: The actual data points must start from **Row 6**. Rows 1-5 are reserved for headers/metadata.
4.  **Coordinate Types**:
    - **Decimal**: `10.7845` (Most efficient)
    - **DMS**: `10°47'04.3"N` (Surveyor friendly - auto-converted)

### **Troubleshooting Conversion**
- **"Invalid Column" Error**: Usually means your Lat/Long aren't in K and L. check your Excel sheet structure.
- **"Empty File"**: Ensure there are no large gaps in your data rows. The processor stops when it finds multiple empty rows.

---

## 🗺️ Local File Viewer

The [Local Viewer](/local-view) allows you to check your work instantly without needing a server upload.

### **How to use it?**
1.  Open the [Viewer](/local-view) page.
2.  Drag and drop your **CSV** file (the one downloaded from our converter).
3.  The map will automatically zoom to fit your survey towers.
4.  Use the **MAP**, **TOWERS**, and **DIST** toggles (top right) to inspect specific details.

*Note: Data loaded in the Local Viewer is private to your browser and not saved on the server.*

---

## 📊 Live Dashboard & GIS Hub

The [Live Dashboard](/live) is the central repository for all synchronized project data.

### **Optimizations for Scale**
- **Virtual Folders**: Data is organized into "Lots". Expanding a folder triggers a "Lazy Load" of metadata.
- **Local Cache**: Once a lot is scanned, results are stored in your browser's `localStorage` for instant loading on your next visit.
- **Global Search**: Quickly find a specific Sub-Station by its code (e.g., `UDT`) or name.

### **Map Interaction**
- **Right-Click**: Copy any point's coordinates to your clipboard.
- **Opacity Slider**: Dim the satellite map to make faint survey lines pop.
- **Smart Labels**: Tower numbers and span distances are only shown when you zoom in (Level 15+) to prevent clutter.

---

## 🏛️ QGIS Integration

QGIS is the final destination for engineering-grade reporting.

### **One-Click Export**
In any live view, click the **"Export QGIS"** button. This generates a `.qgs` project file.
- **What's included?**: Pre-styled layers, correct CRS settings (EPSG:4326), and your survey lines.
- **Recommended Version**: QGIS **3.40 Bratislava**.

### **Manual Loading in QGIS (Standard Method)**
1.  Go to **Layer -> Add Layer -> Add Delimited Text Layer**.
2.  **File Format**: CSV (comma separated values).
3.  **Geometry Definition**:
    - Point coordinates: Use **latitude** and **longitude** columns.
    - WKT: Select **Well Known Text (WKT)** and use the `line_geom` column for lines.
4.  **Coordinate System**: Always set to **EPSG:4326 (WGS 84)** for web data.

---

## ✏️ Built-in CSV Editor

Need to fix a typo? Don't go back to Excel.
1.  Click **"Edit CSV"** on any file in the dashboard.
2.  Modify cells directly in the grid.
3.  The editor supports **Excel Paste** (Ctrl+V) from external sheets.
4.  **Download** the corrected file once finished.