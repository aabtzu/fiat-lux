'use client';

import { useState, useRef, useEffect } from 'react';
import ChatSidebar from './ChatSidebar';
import VisualizationViewer from './VisualizationViewer';

interface InteractiveViewProps {
  fileId: string;
  fileName: string;
}

export default function InteractiveView({ fileId, fileName }: InteractiveViewProps) {
  const [visualization, setVisualization] = useState<string>('');
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLoading) {
        cancelRequest();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLoading]);

  return (
    <div className="flex flex-1 min-h-0 gap-4">
      {/* Main visualization area */}
      <div className={`flex-1 min-h-0 transition-all duration-300 ${isChatOpen ? '' : 'w-full'}`}>
        <VisualizationViewer html={visualization} isLoading={!visualization && isLoading} />
      </div>

      {/* Chat toggle button (when closed) */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className={`fixed right-4 bottom-4 p-3 ${isLoading ? 'bg-amber-500' : 'bg-blue-500'} text-white rounded-full shadow-lg hover:opacity-90 transition-colors z-10`}
          title={isLoading ? 'Processing... (click to open)' : 'Open chat'}
        >
          {isLoading ? (
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          )}
        </button>
      )}

      {/* Chat sidebar - always mounted, visibility toggled */}
      <div
        className={`flex-shrink-0 min-h-0 relative transition-all duration-300 overflow-hidden ${
          isChatOpen ? 'w-80 opacity-100' : 'w-0 opacity-0'
        }`}
      >
        <button
          onClick={() => setIsChatOpen(false)}
          className="absolute -left-3 top-4 p-1 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50 z-10"
          title="Close chat"
        >
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div className="h-full rounded-lg overflow-hidden shadow-lg">
          <ChatSidebar
            fileId={fileId}
            onVisualizationUpdate={setVisualization}
            currentVisualization={visualization}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            abortControllerRef={abortControllerRef}
            onCancel={cancelRequest}
          />
        </div>
      </div>
    </div>
  );
}
