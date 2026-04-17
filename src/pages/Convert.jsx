import React, { useState } from 'react';
import JSZip from 'jszip';
import { processExcelFile } from '../utils/excelUtils';
import { useNavigate } from 'react-router-dom';
import { Map, Download, FileCheck, AlertCircle, FileText } from 'lucide-react';

function Convert() {
    const navigate = useNavigate();
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [processedFiles, setProcessedFiles] = useState([]);
    const [status, setStatus] = useState(null); // { message, type }
    const [isProcessing, setIsProcessing] = useState(false);

    const handleFileChange = (e) => {
        if (e.target.files.length > 0) {
            setSelectedFiles(Array.from(e.target.files));
            setProcessedFiles([]);
            setStatus({ message: "Files loaded. Click 'Process Data & Generate CSVs'.", type: 'info' });
        } else {
            setSelectedFiles([]);
            setStatus(null);
        }
    };

    const updateStatus = (message, type = 'info') => {
        setStatus({ message, type });
    };

    const handleProcess = async () => {
        if (selectedFiles.length === 0) {
            updateStatus("Please select one or more Excel files first.", 'error');
            return;
        }

        setIsProcessing(true);
        setProcessedFiles([]);
        updateStatus(`Processing ${selectedFiles.length} file(s) in batch...`, 'info');


        let successfulCount = 0;
        let failedCount = 0;

        const processPromises = selectedFiles.map(async (file) => {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const result = await processExcelFile(arrayBuffer, file.name);
                return { status: 'fulfilled', value: result };
            } catch (err) {
                console.error(`Error processing ${file.name}:`, err);
                return { status: 'rejected', reason: { fileName: file.name, error: err.message } };
            }
        });

        const outcomes = await Promise.all(processPromises);

        const results = outcomes.map(outcome => {
            if (outcome.status === 'fulfilled') {
                successfulCount++;
                return { success: true, ...outcome.value };
            } else {
                failedCount++;
                return { success: false, fileName: outcome.reason.fileName, error: outcome.reason.error };
            }
        });

        setProcessedFiles(results);
        setIsProcessing(false);

        if (successfulCount > 0) {
            updateStatus(`Successfully processed ${successfulCount} file(s). ${failedCount} failed. Ready for download.`, 'success');
        } else {
            updateStatus(`Processing complete. ${failedCount} file(s) failed. Check console for details.`, 'error');
        }
    };

    const handleDownloadSingle = (fileData) => {
        const blob = new Blob([fileData.csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileData.csvName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        updateStatus(`Downloaded single file: ${fileData.csvName}`, 'info');
    };

    const handleOpenInViewer = (fileData) => {
        // Save to sessionStorage so LocalView can pick it up
        const viewerData = JSON.parse(sessionStorage.getItem('viewer_pending_files') || '[]');
        viewerData.push({
            name: fileData.csvName,
            content: fileData.csvContent,
            timestamp: Date.now()
        });
        sessionStorage.setItem('viewer_pending_files', JSON.stringify(viewerData));
        navigate('/local-view');
    };

    const handleDownloadAll = () => {
        const successfulFiles = processedFiles.filter(f => f.success);
        if (successfulFiles.length === 0) return;

        updateStatus("Creating ZIP archive...", 'info');
        const zip = new JSZip();
        successfulFiles.forEach(fileData => {
            zip.file(fileData.csvName, fileData.csvContent);
        });

        zip.generateAsync({ type: "blob" }).then(content => {
            const zipFileName = "survey_data_batch_" + new Date().toISOString().slice(0, 10) + ".zip";
            const link = document.createElement("a");
            const url = URL.createObjectURL(content);
            link.setAttribute("href", url);
            link.setAttribute("download", zipFileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            updateStatus(`ZIP file containing ${successfulFiles.length} CSVs downloaded successfully.`, 'success');
        }).catch(err => {
            console.error("ZIP failed", err);
            updateStatus("Failed to create ZIP.", 'error');
        });
    };

    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-4">
            <div className="w-full max-w-4xl p-6 bg-white rounded-xl card">
                <h1 className="text-3xl font-bold text-center text-primary-blue mb-2">Survey Data Processor</h1>
                <p className="text-center text-gray-500 mb-6">Automate coordinate conversion and GIS data generation from Excel surveys.</p>

                <div className="space-y-4">
                    <div className="p-6 bg-blue-50 rounded-lg border border-blue-200">
                        <label htmlFor="fileInput" className="block text-lg font-medium text-gray-700 mb-2">
                            1. Upload Excel Files (.xlsx) - Select Multiple
                        </label>
                        <input
                            type="file"
                            id="fileInput"
                            accept=".xlsx"
                            multiple
                            onChange={handleFileChange}
                            className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-primary-blue file:text-white
                hover:file:bg-blue-800 cursor-pointer"
                        />
                        {selectedFiles.length > 0 && (
                            <p className="mt-2 text-sm text-gray-600">{selectedFiles.length} file(s) selected.</p>
                        )}
                    </div>

                    <button
                        onClick={handleProcess}
                        disabled={selectedFiles.length === 0 || isProcessing}
                        className="w-full py-3 px-4 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? 'Processing...' : '2. Process Data & Generate CSVs'}
                    </button>
                </div>

                {/* Status Area */}
                {status && (
                    <div className={`mt-6 p-4 rounded-lg text-sm transition-all duration-300 block 
             ${status.type === 'error' ? 'bg-red-100 text-red-800' :
                            status.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        <strong>Status:</strong> {status.message}
                    </div>
                )}

                {/* Download Area */}
                {processedFiles.length > 0 && (
                    <div className="mt-8">
                        <h2 className="text-xl font-semibold text-primary-blue mb-4 border-b pb-2">3. Download Processed Files</h2>
                        <div className="space-y-3" id="downloadList">
                            {processedFiles.map((fileData, index) => (
                                <div key={index} className={`flex justify-between items-center p-3 rounded-lg border ${fileData.success ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200'}`}>
                                    {fileData.success ? (
                                        <>
                                            <span className="text-gray-700 truncate mr-4">{fileData.csvName} ({fileData.coordinatesSystem})</span>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleOpenInViewer(fileData)}
                                                    className="flex items-center gap-1.5 py-1 px-3 bg-emerald-600 text-white text-[10px] font-bold rounded-full hover:bg-emerald-700 transition-colors shadow-sm uppercase tracking-tight"
                                                >
                                                    <Map size={12} />
                                                    Open in Viewer
                                                </button>
                                                <button
                                                    onClick={() => handleDownloadSingle(fileData)}
                                                    className="flex items-center gap-1.5 py-1 px-3 bg-primary-blue text-white text-[10px] font-bold rounded-full hover:bg-blue-800 transition-colors shadow-sm uppercase tracking-tight"
                                                >
                                                    <Download size={12} />
                                                    Download
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex flex-col w-full">
                                            <div className="flex justify-between items-center w-full">
                                                <div className="flex items-center text-red-700 font-medium truncate mr-4">
                                                    <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    {fileData.fileName}
                                                </div>
                                                <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded font-medium ml-auto whitespace-nowrap">Failed</span>
                                            </div>
                                            <p className="text-sm text-red-600 mt-1 ml-6">{fileData.error}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                        {processedFiles.some(f => f.success) && (
                            <button
                                onClick={handleDownloadAll}
                                className="mt-6 w-full py-3 px-4 bg-yellow-600 text-white font-semibold rounded-lg shadow-md hover:bg-yellow-700 transition-colors"
                            >
                                Download All as ZIP
                            </button>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}

export default Convert;
