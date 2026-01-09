'use client';

import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface VisualizationViewerProps {
  html: string;
  isLoading?: boolean;
  fileName?: string;
}

export default function VisualizationViewer({ html, isLoading, fileName = 'visualization' }: VisualizationViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isExporting, setIsExporting] = useState(false);

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
      </div>
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
