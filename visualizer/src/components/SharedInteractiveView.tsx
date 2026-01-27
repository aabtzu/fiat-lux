'use client';

import { useState } from 'react';
import VisualizationViewer from './VisualizationViewer';

interface SourceFile {
  id: string;
  originalName: string;
  filePath: string;
  mimeType?: string;
  addedAt: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SharedInteractiveViewProps {
  fileId: string;
  fileName: string;
  token: string;
  canEdit: boolean;
  initialVisualization?: string;
  initialChatHistory?: ChatMessage[];
  initialSourceFiles?: SourceFile[];
}

export default function SharedInteractiveView({
  fileName,
  canEdit,
  initialVisualization,
  initialSourceFiles = [],
}: SharedInteractiveViewProps) {
  const [visualization] = useState<string>(initialVisualization || '');
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);

  // For now, shared view is read-only (no chat interaction)
  // In the future, we could enable chat for users with edit access

  return (
    <div className="flex flex-1 min-h-0 gap-4">
      {/* Main visualization area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Source files bar - collapsible */}
        {initialSourceFiles.length > 0 && (
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
                Data sources ({initialSourceFiles.length})
              </button>
              {!isSourcesExpanded && (
                <span className="text-xs text-gray-400 truncate max-w-md">
                  {initialSourceFiles.map(f => f.originalName).join(', ')}
                </span>
              )}
            </div>
            {isSourcesExpanded && (
              <div className="mt-2 flex flex-wrap gap-2 pl-4">
                {initialSourceFiles.map((f) => (
                  <span key={f.id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
                    {f.originalName}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0">
          <VisualizationViewer html={visualization} isLoading={false} fileName={fileName} />
        </div>
      </div>

      {/* Info panel for shared view */}
      <div className="w-64 bg-white rounded-lg shadow-sm border border-gray-200 p-4 hidden md:block">
        <h3 className="font-medium text-gray-800 mb-3">Shared View</h3>
        <p className="text-sm text-gray-500 mb-4">
          {canEdit
            ? 'You have edit access to this document.'
            : 'This is a view-only shared document.'}
        </p>
        <div className="text-xs text-gray-400">
          <p>To interact with this document or create your own visualizations, please sign in or create an account.</p>
        </div>
      </div>
    </div>
  );
}
