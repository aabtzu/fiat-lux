'use client';

import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface TableInfo {
  id: string;
  name: string;
  description: string;
  rowCount: number;
}

interface VisualizationViewerProps {
  html: string;
  isLoading?: boolean;
  fileName?: string;
}

export default function VisualizationViewer({ html, isLoading, fileName = 'visualization' }: VisualizationViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [availableTables, setAvailableTables] = useState<TableInfo[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(false);

  const downloadCsv = (csvData: string, exportName: string) => {
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${exportName}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleCsvClick = async () => {
    if (!html) {
      alert('No visualization to export');
      return;
    }

    setIsLoadingTables(true);
    setShowCsvModal(true);
    setAvailableTables([]);

    try {
      const response = await fetch('/api/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, action: 'identify' }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API error:', response.status, errorData);
        setAvailableTables([]);
        return;
      }

      const data = await response.json();
      if (data.parseError) {
        console.error('Parse error from API:', data.parseError);
      }
      setAvailableTables(data.tables || []);
    } catch (error) {
      console.error('Failed to identify tables:', error);
      setAvailableTables([]);
    } finally {
      setIsLoadingTables(false);
    }
  };

  const handleTableSelect = async (table: TableInfo) => {
    setIsExporting(true);

    try {
      const response = await fetch('/api/export-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html,
          action: 'extract',
          tableId: table.id,
          tableName: table.name,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.csvData) {
          const exportName = `${fileName}-${table.id}`.replace(/\s+/g, '-').toLowerCase();
          downloadCsv(data.csvData, exportName);
        }
      }
    } catch (error) {
      console.error('Failed to export table:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
      setShowCsvModal(false);
    }
  };

  const exportToImage = async (format: 'jpg' | 'pdf') => {
    if (!iframeRef.current) return;

    setIsExporting(true);
    try {
      const iframe = iframeRef.current;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc?.body) return;

      // Inject CSS to prevent text truncation during export
      const exportStyle = iframeDoc.createElement('style');
      exportStyle.id = 'export-fix';
      exportStyle.textContent = `
        * {
          overflow: visible !important;
          text-overflow: clip !important;
          white-space: normal !important;
        }
      `;
      iframeDoc.head.appendChild(exportStyle);

      // Wait for styles to apply
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(iframeDoc.body, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });

      // Remove the injected style
      exportStyle.remove();

      if (format === 'jpg') {
        const link = document.createElement('a');
        link.download = `${fileName}.jpg`;
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.click();
      } else {
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height],
        });
        pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
        pdf.save(`${fileName}.pdf`);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading || !html) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50 rounded-lg">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 mx-auto mb-3 text-blue-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <p className="text-gray-500">Generating visualization...</p>
        </div>
      </div>
    );
  }

  // Wrap the HTML in a full document with base styles
  const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 1.5rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
      color: #1f2937;
    }
  </style>
</head>
<body>
${html}
</body>
</html>`;

  return (
    <div className="h-full overflow-hidden bg-white rounded-lg shadow-inner relative">
      <div className="absolute top-3 right-3 flex gap-2 z-10">
        <button
          onClick={() => exportToImage('jpg')}
          disabled={isExporting}
          className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-gray-100 border border-gray-400 rounded-md shadow-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          title="Export as JPG"
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          JPG
        </button>
        <button
          onClick={() => exportToImage('pdf')}
          disabled={isExporting}
          className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-gray-100 border border-gray-400 rounded-md shadow-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          title="Export as PDF"
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          PDF
        </button>
        <button
          onClick={handleCsvClick}
          disabled={isExporting || isLoadingTables}
          className="px-3 py-1.5 text-sm font-semibold text-gray-700 bg-gray-100 border border-gray-400 rounded-md shadow-sm hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          title="Export data as CSV"
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          CSV
        </button>
      </div>

      {/* CSV Export Modal */}
      {showCsvModal && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">Export to CSV</h3>
              <button
                onClick={() => setShowCsvModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              {isLoadingTables ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-6 w-6 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-gray-600">Analyzing visualization...</span>
                </div>
              ) : availableTables.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No exportable tables found in this visualization.</p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 mb-3">Select the data to export:</p>
                  {availableTables.map((table) => (
                    <button
                      key={table.id}
                      onClick={() => handleTableSelect(table)}
                      disabled={isExporting}
                      className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
                    >
                      <div className="font-medium text-gray-800">{table.name}</div>
                      <div className="text-sm text-gray-500">{table.description}</div>
                      <div className="text-xs text-gray-400 mt-1">~{table.rowCount} rows</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <iframe
        ref={iframeRef}
        srcDoc={fullHtml}
        className="w-full h-full border-0"
        title="Visualization"
        sandbox="allow-scripts allow-modals allow-same-origin"
      />
    </div>
  );
}
