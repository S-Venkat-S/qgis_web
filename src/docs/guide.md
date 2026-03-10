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

## QGIS

### **Downloading QGIS**
1. Navigate to the [QGIS website](https://www.qgis.org/en/site/forusers/download.html).
2. Download the latest version of QGIS. 
3. Version **3.40 Bratislava** is recommended.
4. Install QGIS.
![QGIS Version](/docs/qgis_version.png)
5. Make sure the Project Properties CRS (_Coordinate Reference System_) is set to **EPSG:4326 - WGS 84**.
![Project Properties](/docs/crs.png)

### **Uploading of CSV file in QGIS as Delimited Text Layer**
1. Open QGIS and click on the **Layer -> Add Layer -> Add Delimited Text Layer** or **Ctrl + Shift + T**.
![Add Delimited Text Layer](/docs/add_delimited_text_layer.png)
2. Click on the **Browse** ![Add Delimited Text Layer](/docs/browser.png) button and select the CSV file you want to upload.
3. In the Geometry Definition, 
    - select **Well Known Text (WKT)**.
    - Set Geometry Field as **line_geom**.
    - Set Geometry Type as **LineString** or **Detect**.
    - Set Geometry CRS as **EPSG:32644 - WGS 84 / UTM zone 44N**.
4. Click on the **Add** button.
![Add Delimited Text Layer](/docs/delimited_text_layer.png)

### **Uploading of CSV file in QGIS as Add Vector Layer**
1. Open QGIS and click on the **Layer -> Add Layer -> Add Vector Layer** or **Ctrl + Shift + V**.
2. Selecting files,
    - In the Source Type, select **File** and choose multiple files.
    - Or change the Source Type to **Directory** and select the directory containing the CSV files.
3. Click on the **Browse** in Source ![Add Delimited Text Layer](/docs/browser.png) button and select the CSV file you want to upload.
3. In the Options, 
    - Set GEOM_POSSIBLE_NAMES to **line_geom**.
    - Leave the other options as default.
4. Click on the **Add** button.
![Vector Layer](/docs/vector_layer.png)

### **Layer Options in QGIS**
1. After adding the layer, it will be visible in the Layers panel.
![Layer Panel](/docs/layers.png)
2. Right click on the layer and select **Zoom to Layer(s)** to view the layer in the map canvas.
![Zoom to Layer](/docs/zoom_to_layer.png)
3. Right click on the layer and select **Properties** to view the layer properties.
![Layer Properties](/docs/layer_properties.png)
4. In the Properties window,
    - In the **General** tab, you can see the layer information.
    - In the **Symbology** tab, you can change the layer symbology.
    - In the **Labels** tab, you can add labels to the layer. You can use @layer_name to display the layer name. 
    - More expressions / formulas related docs can be found in the [QGIS Expressions](https://docs.qgis.org/3.40/en/docs/user_manual/expressions/index.html).
    - More option regarding the label, symbology, etc can be found in the [QGIS Labeling](https://docs.qgis.org/3.40/en/docs/training_manual/vector_classification/label_tool.html).
    ![Layer Label](/docs/layer_label.png)
5. Copying layer style
    - Right click on the layer and select **Styles -> Copy Style -> All Style Catergories**.
    - Select the layers you want to copy the style to.
    - Right click on the selected layers and select **Paste Style**.
    ![Copy Paste Style](/docs/copy_styles.png)
6. Grouping, Moving and Hiding layers
    - Drag and drop the layers to group them, move them up or down, or hide them.
    ![Layer Grouping](/docs/layer_grouping.png)

### **Export / Printing Map**
1. For Exporting / Printing Map, refer to the [QGIS Print Composer](https://docs.qgis.org/3.40/en/docs/user_manual/print_composer/overview_composer.html).

### **Adding of Google Maps in QGIS**
1. Click **Plugins -> Manage and Install Plugins**.
![Add Plugin](/docs/add_plugins.png)
2. In the search bar, type "QuickMapServices" and click on the "Install Plugin" button.
![QuickMapServices](/docs/quickmapservices.png)
3. After installation, click on the **Web -> QuickMapServices -> Search NextGIS on QMS**.
![Search NextGIS on QMS](/docs/search_qms.png)
4. In the search bar, type "Google Maps" and click on the "Add" button in the **Google Maps**.
![Add Google Maps](/docs/google_maps.png)