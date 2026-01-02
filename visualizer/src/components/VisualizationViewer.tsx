'use client';

interface VisualizationViewerProps {
  html: string;
  isLoading?: boolean;
}

export default function VisualizationViewer({ html, isLoading }: VisualizationViewerProps) {
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
    <div className="h-full overflow-hidden bg-white rounded-lg shadow-inner">
      <iframe
        srcDoc={fullHtml}
        className="w-full h-full border-0"
        title="Visualization"
        sandbox="allow-scripts allow-modals"
      />
    </div>
  );
}
