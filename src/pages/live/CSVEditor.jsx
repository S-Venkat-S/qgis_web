import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { updatedLots } from './MapUtils';

const CSVEditor = () => {
    const { lotId, fileName } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [originalData, setOriginalData] = useState([]);
    const [headers, setHeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [curFileName, setCurFileName] = useState(fileName);
    const [curLotId, setCurLotId] = useState(lotId);
    const [colWidths, setColWidths] = useState({});
    const [resizing, setResizing] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        document.title = curFileName ? `Edit: ${curFileName}` : "CSV Editor";
    }, [curFileName]);

    useEffect(() => {
        let lot = updatedLots.find(l => l.id === lotId);

        // Handle root level files (like All Sub Station.csv)
        if (!lot && lotId === 'root') {
            lot = { id: 'root', basePath: '/view/' };
        }

        if (!lot || !fileName) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const fileUrl = `${lot.basePath}${fileName}`;
        setCurFileName(fileName);
        setCurLotId(lotId);

        Papa.parse(fileUrl, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.data && results.data.length > 0) {
                    setHeaders(Object.keys(results.data[0]));
                    setData(results.data);
                    setOriginalData(JSON.parse(JSON.stringify(results.data)));
                }
                setLoading(false);
            },
            error: (err) => {
                console.error("CSV Load Error:", err);
                setLoading(false);
            }
        });
    }, [lotId, fileName]);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoading(true);
        setCurFileName(file.name);
        setCurLotId("UPLOADED");

        // Remove the server-specific URL from the browser bar
        navigate('/live/edit/local/file', { replace: true });

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.data && results.data.length > 0) {
                    setHeaders(Object.keys(results.data[0]));
                    setData(results.data);
                    setOriginalData(JSON.parse(JSON.stringify(results.data)));
                }
                setLoading(false);
            }
        });
    };

    const handleClearToTemplate = () => {
        if (!window.confirm("This will clear all rows but keep headers. Continue?")) return;
        setOriginalData([]);
        setData([{ ...Object.fromEntries(headers.map(h => [h, ""])) }]);
    };

    const handleCellChange = (rowIndex, column, value) => {
        const newData = [...data];
        newData[rowIndex][column] = value;
        setData(newData);
    };

    const handleKeyDown = (e, rowIndex, headerIndex) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const nextRow = e.currentTarget.closest('tr').nextElementSibling;
            if (nextRow) {
                const nextInput = nextRow.querySelectorAll('input')[headerIndex];
                if (nextInput) nextInput.focus();
            } else {
                e.currentTarget.blur();
            }
        }
    };

    const handlePaste = (e, rowIndex, startHeaderIndex) => {
        const paste = e.clipboardData.getData('text');
        if (!paste.includes('\t') && !paste.includes('\n')) return;

        e.preventDefault();
        const rows = paste.split(/\r?\n/).filter(line => line.length > 0);
        const newData = [...data];
        const newOriginalData = [...originalData];

        rows.forEach((rowText, rIdx) => {
            const rowTarget = rowIndex + rIdx;
            const cells = rowText.split('\t');

            if (rowTarget < data.length) {
                // Existing row: Update data but keep originalData as-is to highlight changes
                cells.forEach((cellValue, cIdx) => {
                    const headerTarget = headers[startHeaderIndex + cIdx];
                    if (headerTarget) {
                        newData[rowTarget][headerTarget] = cellValue;
                    }
                });
            } else {
                // New row: Initialize both to the same value (no highlighting for new rows)
                const newRow = Object.fromEntries(headers.map(h => [h, ""]));
                cells.forEach((cellValue, cIdx) => {
                    const headerTarget = headers[startHeaderIndex + cIdx];
                    if (headerTarget) newRow[headerTarget] = cellValue;
                });
                newData.push(newRow);
                newOriginalData.push(JSON.parse(JSON.stringify(newRow)));
            }
        });

        setData(newData);
        setOriginalData(newOriginalData);
    };

    const startResize = (e, header) => {
        e.preventDefault();
        setResizing({
            header,
            startX: e.pageX,
            startWidth: colWidths[header] || (headers.indexOf(header) > -1 ? (['name', 'description', 'remarks'].some(k => header.toLowerCase().includes(k)) ? 150 : 80) : 100)
        });
    };

    useEffect(() => {
        if (!resizing) return;

        const handleMouseMove = (e) => {
            const diff = e.pageX - resizing.startX;
            setColWidths(prev => ({
                ...prev,
                [resizing.header]: Math.max(50, resizing.startWidth + diff)
            }));
        };

        const handleMouseUp = () => setResizing(null);

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizing]);

    const handleClearToBlank = () => {
        if (!window.confirm("This will clear all rows. Continue?")) return;
        const emptyRow = Object.fromEntries(headers.map(h => [h, ""]));
        setData([emptyRow]);
        setOriginalData([JSON.parse(JSON.stringify(emptyRow))]);
        setCurLotId("TEMPLATE");
    };

    const addColumn = () => {
        const name = window.prompt("Enter new column name:");
        if (name && !headers.includes(name)) {
            const newHeaders = [...headers, name];
            setHeaders(newHeaders);
            setData(data.map(row => ({ ...row, [name]: "" })));
            setOriginalData(originalData.map(row => ({ ...row, [name]: "" })));
            if (data.length === 0) {
                setData([{ [name]: "" }]);
                setOriginalData([{ [name]: "" }]);
            }
        }
    };

    const addRow = () => {
        const newRow = Object.fromEntries(headers.map(h => [h, ""]));
        setData([...data, newRow]);
        setOriginalData([...originalData, JSON.parse(JSON.stringify(newRow))]);
    };

    const handleDownload = () => {
        if (data.length === 0) return;
        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", curFileName.endsWith('.csv') ? curFileName : `${curFileName}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleBack = () => navigate('/live');

    if (loading) {
        return (
            <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-gray-50 uppercase font-bold text-gray-400 tracking-widest text-[11px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-blue mb-4"></div>
                Initializing Editor...
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col bg-white overflow-hidden">
            {/* Session Warning Banner */}
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-3 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">
                    Live Session: Edits are not saved to the server. Please download a copy to keep your changes.
                </p>
                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            </div>

            {/* Header Area */}
            <div className="p-4 border-b flex items-center justify-between shadow-sm z-10 bg-white">
                <div className="flex items-center">
                    <button
                        onClick={handleBack}
                        className="mr-4 p-2 rounded-full hover:bg-gray-100 transition-all text-gray-500 hover:text-primary-blue"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </button>
                    <div>
                        <h2 className="text-sm font-black text-gray-800 uppercase tracking-tight truncate max-w-[300px]">
                            Editing: <span className="text-primary-blue">{curFileName}</span>
                        </h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded text-gray-500 font-mono font-bold uppercase">{curLotId}</span>
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{data.length} ROWS FOUND</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={addColumn}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-[9px] font-black uppercase tracking-widest hover:bg-primary-blue hover:text-white transition-all"
                    >
                        + Col
                    </button>
                    <button
                        onClick={addRow}
                        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-600 rounded text-[9px] font-black uppercase tracking-widest hover:bg-primary-blue hover:text-white transition-all"
                    >
                        + Row
                    </button>
                    <div className="h-6 w-px bg-gray-200 mx-1"></div>

                    <label className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-gray-200 transition-all cursor-pointer">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Upload
                        <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                    </label>

                    <button
                        onClick={handleClearToBlank}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all border border-rose-100"
                    >
                        Reset Blank
                    </button>

                    <button
                        onClick={handleDownload}
                        disabled={data.length === 0 || headers.length === 0}
                        className="flex items-center gap-2 px-6 py-2 bg-primary-blue text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 disabled:bg-gray-200"
                    >
                        Download
                    </button>
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-grow overflow-x-auto bg-gray-50 p-6">
                <div className="bg-white rounded-xl shadow-xl border border-gray-100 min-w-max">
                    <table className="border-collapse w-full">
                        <thead>
                            <tr className="bg-gray-900 text-white">
                                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest border-r border-white/10 w-16 text-center sticky left-0 z-20 bg-gray-900">#</th>
                                {headers.map((h, i) => {
                                    const wideCols = ['name', 'description', 'remarks', 'filename'];
                                    const isWide = wideCols.some(key => h.toLowerCase().includes(key)) || h.length > 20;
                                    const width = colWidths[h] || (isWide ? 150 : 80);

                                    return (
                                        <th
                                            key={h}
                                            className="px-2 py-2 text-[9px] font-black uppercase tracking-widest border-r border-white/10 whitespace-normal break-words leading-tight relative group"
                                            style={{ width: `${width}px`, minWidth: `${width}px` }}
                                        >
                                            {h}
                                            <div
                                                onMouseDown={(e) => startResize(e, h)}
                                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-blue/50 z-30 transition-colors"
                                            />
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {data.length > 0 ? data.map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-blue-50/10 transition-colors">
                                    <td className="px-2 py-1.5 text-[9px] font-bold text-gray-400 bg-gray-50 text-center border-r sticky left-0 z-10">
                                        {rowIndex + 1}
                                    </td>
                                    {headers.map((header, hIdx) => {
                                        const origRow = originalData[rowIndex];
                                        const isModified = origRow && String(row[header]) !== String(origRow[header]);
                                        const wideCols = ['name', 'description', 'remarks', 'filename'];
                                        const isWide = wideCols.some(key => header.toLowerCase().includes(key)) || header.length > 20;
                                        const width = colWidths[header] || (isWide ? 150 : 80);

                                        return (
                                            <td
                                                key={`${rowIndex}-${header}`}
                                                className={`p-0 border-r border-gray-100 last:border-0 transition-colors ${isModified ? 'bg-amber-50' : ''}`}
                                                style={{ width: `${width}px`, minWidth: `${width}px` }}
                                            >
                                                <input
                                                    type="text"
                                                    value={row[header] || ""}
                                                    onChange={(e) => handleCellChange(rowIndex, header, e.target.value)}
                                                    onKeyDown={(e) => handleKeyDown(e, rowIndex, hIdx)}
                                                    onPaste={(e) => handlePaste(e, rowIndex, hIdx)}
                                                    className={`w-full h-full px-2 py-2 text-[10px] font-medium outline-none focus:ring-2 focus:ring-primary-blue/20 transition-all border-0 bg-transparent ${isModified ? 'text-amber-800' : 'text-gray-700'}`}
                                                    spellCheck={false}
                                                    title={isModified ? `Original: ${origRow[header]}` : ""}
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={headers.length + 1} className="py-20 text-center text-gray-300 font-bold uppercase tracking-widest text-[10px]">
                                        {headers.length > 0 ? "No rows yet. Click '+ Row' to start." : "Editor is blank. Add columns to begin."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                input:focus {
                    background: white !important;
                }
            `}} />
        </div>
    );
};

export default CSVEditor;
