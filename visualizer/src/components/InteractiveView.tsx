'use client';

import { useState, useRef, useEffect } from 'react';
import ChatSidebar from './ChatSidebar';
import VisualizationViewer from './VisualizationViewer';

interface SourceFile {
  id: string;
  originalName: string;
  filePath: string;
  mimeType?: string;
  addedAt: string;
}

interface InteractiveViewProps {
  fileId: string;
  fileName: string;
  initialSourceFiles?: SourceFile[];
  initialPrompt?: string;
}

export default function InteractiveView({ fileId, fileName, initialSourceFiles = [], initialPrompt }: InteractiveViewProps) {
  const [visualization, setVisualization] = useState<string>('');
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>(initialSourceFiles);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await uploadAdditionalFiles(files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadAdditionalFiles(Array.from(files));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadAdditionalFiles = async (files: File[]) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('documentId', fileId);
      for (const file of files) {
        formData.append('file', file);
      }

      const response = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.sourceFiles && data.sourceFiles.length > 0) {
          setSourceFiles((prev) => [...prev, ...data.sourceFiles]);

          // Trigger auto-update with new files
          const fileNames = data.sourceFiles.map((f: SourceFile) => f.originalName).join(', ');
          const message = visualization
            ? `New data files added: ${fileNames}. Please incorporate this new data into the existing visualization.`
            : `Create an initial visualization including the new files: ${fileNames}`;
          setPendingMessage(message);
        }
      }
    } catch (error) {
      console.error('Error uploading files:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const removeSourceFile = async (sourceFileId: string) => {
    try {
      const response = await fetch(`/api/files?id=${fileId}&sourceFileId=${sourceFileId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSourceFiles((prev) => prev.filter((f) => f.id !== sourceFileId));
      }
    } catch (error) {
      console.error('Error removing source file:', error);
    }
  };

  return (
    <div
      className="flex flex-1 min-h-0 gap-4 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500 bg-opacity-20 border-4 border-dashed border-blue-500 rounded-lg z-50 flex items-center justify-center">
          <div className="bg-white px-6 py-4 rounded-lg shadow-lg text-center">
            <svg className="w-12 h-12 mx-auto mb-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-gray-700 font-medium">Drop files to add context</p>
          </div>
        </div>
      )}

      {/* Upload progress indicator */}
      {isUploading && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Uploading...</span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        accept=".txt,.csv,.json,.pdf,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png,.gif,.webp"
        className="hidden"
      />

      {/* Main visualization area */}
      <div className={`flex-1 min-h-0 transition-all duration-300 flex flex-col ${isChatOpen ? '' : 'w-full'}`}>
        {/* Source files bar - collapsible */}
        <div className="mb-2 px-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <svg
                className={`w-3 h-3 transition-transform ${isSourcesExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Data sources ({sourceFiles.length})
            </button>
            {!isSourcesExpanded && sourceFiles.length > 0 && (
              <span className="text-xs text-gray-400 truncate max-w-md">
                {sourceFiles.map(f => f.originalName).join(', ')}
              </span>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1 ml-auto"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add files
            </button>
          </div>
          {isSourcesExpanded && (
            <div className="mt-2 flex flex-wrap gap-2 pl-4">
              {sourceFiles.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                  {f.originalName}
                  <button onClick={() => removeSourceFile(f.id)} className="hover:text-blue-900">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0">
          <VisualizationViewer html={visualization} isLoading={!visualization && isLoading} fileName={fileName} />
        </div>
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
            fileName={fileName}
            onVisualizationUpdate={setVisualization}
            currentVisualization={visualization}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            abortControllerRef={abortControllerRef}
            onCancel={cancelRequest}
            pendingMessage={pendingMessage}
            onPendingMessageHandled={() => setPendingMessage(null)}
            initialPrompt={initialPrompt}
          />
        </div>
      </div>
    </div>
  );
}
