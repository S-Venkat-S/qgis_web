import React, { useState, useEffect } from 'react';

function Download() {
    const [fileDates, setFileDates] = useState({});

    const lots = [
        { id: 'lot1', name: 'LOT 1', description: 'Survey data for Coimbatore Region', downloadLink: '/downloads/qgis - LOT_1.zip' },
        { id: 'lot2', name: 'LOT 2', description: 'Survey data for Trichy Region', downloadLink: '/downloads/qgis - LOT_2.zip' },
        { id: 'lot3', name: 'LOT 3', description: 'Survey data for Madurai Region', downloadLink: '/downloads/qgis - LOT_3.zip' },
        { id: 'lot4', name: 'LOT 4', description: 'Survey data for Chennai Region', downloadLink: '/downloads/qgis - LOT_4.zip' },
        { id: 'alllot', name: 'Consolidated', description: 'Survey data for All Regions', downloadLink: '/downloads/qgis - Consolidated.zip' },
        { id: 'lease', name: 'Lease Links', description: 'Survey data for Lease Links', downloadLink: '/downloads/qgis - Lease.zip' },
    ];

    useEffect(() => {
        const fetchDates = async () => {
            const dates = {};

            const formatDate = (dateInput) => {
                const date = new Date(dateInput);
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                return `${day}-${month}-${year}`;
            };

            await Promise.all(lots.map(async (lot) => {
                try {
                    const response = await fetch(lot.downloadLink, { method: 'HEAD' });
                    const lastModified = response.headers.get('Last-Modified');

                    if (response.ok && lastModified) {
                        dates[lot.id] = formatDate(lastModified);
                    } else {
                        // Fallback to current date if file not found or header missing
                        dates[lot.id] = formatDate(new Date());
                    }
                } catch (error) {
                    // Fallback to current date on network error
                    dates[lot.id] = formatDate(new Date());
                }
            }));
            setFileDates(dates);
        };

        fetchDates();
    }, []);

    const handleDownload = (lot) => {
        const link = document.createElement('a');
        link.href = lot.downloadLink;
        link.setAttribute('download', lot.downloadLink.split('/').pop());
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] bg-gray-50 flex justify-center p-8">
            <div className="w-full max-w-2xl bg-white rounded-xl shadow-lg p-8">
                <h1 className="text-3xl font-bold text-center text-primary-blue mb-8">Download Survey Data</h1>

                <div className="space-y-4">
                    {lots.map((lot) => (
                        <div key={lot.id} className="flex flex-col sm:flex-row justify-between items-center p-5 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                            <div className="mb-4 sm:mb-0">
                                <h3 className="text-lg font-semibold text-gray-800">{lot.name}</h3>
                                <p className="text-sm text-gray-500">{lot.description}</p>
                                {fileDates[lot.id] && (
                                    <p className="text-xs text-gray-400 mt-1 flex items-center">
                                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        Updated: {fileDates[lot.id]}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={() => handleDownload(lot)}
                                className="py-2 px-6 bg-primary-blue text-white font-medium rounded-full hover:bg-blue-700 transition-colors shadow-sm flex items-center"
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default Download;
