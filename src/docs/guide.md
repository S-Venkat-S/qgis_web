# Documentation

Welcome to the **Survey Data Processor** documentation. Below you will find comprehensive guides and answers about using this tool.

## Initial Conversion

### **What is the process?**
Upload the Excel survey file in the convert page and click convert, the app will conver the uploaded file into CSV format and able to download after completed. This supports uploading of multiple files at once.

After conversion, the downloaded csv file can be loaded in QGIS by using the "Add Delimited Text Layer" or "Add Vector Layer" tool.

### **What are the prerequisites for correct conversion?**
1. The Excel file should be in `.xlsx` format.
2. The Excel file should have the following constraints:
    - The **Latitude** and **Longitude** column should be in **K** and **L** columns respectively.
    - The start of the lattitude and longitude should be in the **6th row**.
    - The GPS format should be in **decimal degrees (dd)** [8.7654321], **degrees-minutes-seconds (dms)** [8°45'54.321"N].
    - Its best to conver the UTM coordinates (northing, easting) to DD or DMS before uploading the file.

![Sample Excel File](/docs/excel_header.png)

### **How to convert the files?**
1. Go to the [convert page](/convert) and upload the excel file (Multiple files can be uploaded at once).
2. Click **Process Data & Generate CSVs**.
3. **Download** each files or click **Download All as ZIP** to download all the files.
4. If there's any error in the file, it will be shown in the download list. Kindly correct the error and upload the file again.
![Convert Page](/docs/convert_page.png)

## Survey Dashboard

### **What is the Survey Dashboard?**
The [Live Dashboard](/live) provides a real-time overview of all survey lots and files stored on the server. It automatically calculates key metrics like total KM length and number of towers for every file.

### **Managing Large Datasets (1000+ Files)**
The dashboard is optimized for large projects:
- **Lazy Loading**: Statistics (KM/Towers) are only calculated when you expand a Lot folder.
- **Local Caching**: Calculated stats are saved in your browser. When you return later, they load instantly without re-downloading files.
- **Progress Tracking**: A progress bar shows the percentage of files analyzed in real-time.

### **How do I refresh data from the server?**
If a file is updated on the server, the dashboard might show old cached stats.
- **Lot Refresh**: Click the 🔄 button next to a Lot's sort menu to force a re-scan of just those files.
- **Global Purge**: Click the 🗑️ icon next to "Network Overview" to clear all local cache and start fresh.

### **Sorting and Searching**
You can sort files within each Lot by:
- **Name**: Alphabetical order.
- **KM (High-Low)**: Longest survey lines first.
- **Towers**: Most tower points first.
- **Date (Recent)**: Most recently updated files first.
Use the **Global Search** bar at the top to filter files across all lots by name.

## Advanced Map Features

### **Interactive Map Controls**
- **Layer Toggles**: In the top-right corner of the map, you can toggle **MAP** (Satellite), **TOWERS** (Point markers), **DIST** (Span lengths), and **STATIONS** (Sub-station markers).
- **Opacity Slider**: Adjust the background satellite map transparency to make survey lines stand out.
- **Right-Click to Copy**: Right-click anywhere on the map to show a **"Copy Lat, Lng"** button. This copies the exact coordinates of that spot to your clipboard.

### **Multi-Tab Workflow**
The dashboard now supports multi-tasking:
- Clicking **"View Map"** or **"Edit CSV"** opens the file in a **new browser tab**.
- Tab titles are automatically updated to the **Filename**, so you can easily switch between multiple open surveys.

### **Global Assets (Sub-Stations)**
The **"All Sub Station.csv"** file is accessible at the top of the dashboard. This global layer can be edited to update station names/locations across the entire map network.

## Inbuilt CSV Editor

### **Using the Editor**
The editor allows you to fix survey data directly in your browser without needing Excel.
- **Smart Paste**: Copy cells from Excel or Google Sheets and paste them directly into the editor. It will automatically create new rows/columns if needed.
- **Manual Resizing**: Drag the edges of column headers to resize them for better visibility.
- **Diff Highlighting**: Any cell you modify will turn **Amber**, making it easy to track your local changes.
- **Keyboard Shortcuts**: Press **Enter** to move to the next row while typing.

### **Session & Saving**
- **Warning**: Edits made in the editor are **local to your browser session**. If you refresh the page or close the tab, unsaved changes will be lost.
- **Saving**: Click the **Download** button to save your edited file back to your computer. You can then re-upload it to the server using the deployment tools.

## Deployment (Technical Reference)

### **Optimized Uploading**
The deployment process uses an **Optimized Parallel Uploader** (`upload_optimized.js`):
- **10 Parallel Connections**: Uploads 10 files at a time to maximize speed.
- **Smart Sync**: Automatically compares local and remote file sizes/timestamps. It only uploads files that have actually changed, skipping the rest.
- **Prebuild Indexing**: Every time you build the project, it automatically updates the `index.txt` files used by the dashboard.

### **Deployment Commands**
- `npm run build:deploy`: Full build, re-index, and smart-sync all files.
- `npm run deploy:fast`: Skips the heavy `view/` CSV data and only updates the browser application code.

## QGIS Integration

### **Downloading QGIS**
1. Navigate to the [QGIS website](https://www.qgis.org/en/site/forusers/download.html).
2. Download the latest version of QGIS. 
3. Version **3.40 Bratislava** is recommended.
4. Install QGIS.
![QGIS Version](/docs/qgis_version.png)
5. Make sure the Project Properties CRS (_Coordinate Reference System_) is set to **EPSG:4326 - WGS 84**.
![Project Properties](/docs/crs.png)

### **One-Click QGIS Export**
In any Map View, click **"Export QGIS"** to download a `.qgs` project file. Open this file in QGIS to see your survey lines pre-styled and ready for mapping.

### **Manual CSV Loading in QGIS**
1. Open QGIS and click on the **Layer -> Add Layer -> Add Delimited Text Layer** or **Ctrl + Shift + T**.
![Add Delimited Text Layer](/docs/add_delimited_text_layer.png)
2. In the Geometry Definition:
    - select **Well Known Text (WKT)**.
    - Set Geometry Field as **line_geom**.
    - Set Geometry CRS as **EPSG:32644 - WGS 84 / UTM zone 44N**.
3. Click on the **Add** button.