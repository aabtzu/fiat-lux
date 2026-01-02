'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { ImportedFile, FileType } from '@/lib/storage';

interface FileListProps {
  files: ImportedFile[];
  onDelete: (id: string) => void;
}

function getFileTypeStyles(type: FileType): { bg: string; text: string; icon: ReactNode } {
  const icons = {
    schedule: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    invoice: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
      </svg>
    ),
    healthcare: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    unknown: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  };

  const styles: Record<FileType, { bg: string; text: string }> = {
    schedule: { bg: 'bg-blue-100', text: 'text-blue-700' },
    invoice: { bg: 'bg-green-100', text: 'text-green-700' },
    healthcare: { bg: 'bg-pink-100', text: 'text-pink-700' },
    unknown: { bg: 'bg-gray-100', text: 'text-gray-700' },
  };

  return { ...styles[type], icon: icons[type] };
}

function getFileTypeLabel(type: FileType): string {
  const labels: Record<FileType, string> = {
    schedule: 'Schedule',
    invoice: 'Invoice',
    healthcare: 'Healthcare',
    unknown: 'Document',
  };
  return labels[type];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function FileList({ files, onDelete }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <svg
          className="w-16 h-16 mx-auto mb-4 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="text-lg font-medium text-gray-600 mb-1">No files yet</h3>
        <p className="text-gray-400">Import a file above to get started</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Previous Imports</h2>
      </div>

      <ul className="divide-y divide-gray-200">
        {files.map((file) => {
          const styles = getFileTypeStyles(file.fileType);

          return (
            <li key={file.id} className="hover:bg-gray-50 transition-colors">
              <div className="px-6 py-4 flex items-center gap-4">
                <div className={`p-2 rounded-lg ${styles.bg} ${styles.text}`}>
                  {styles.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <Link
                    href={`/view/${file.id}`}
                    className="text-gray-900 font-medium hover:text-blue-600 truncate block"
                  >
                    {file.displayName}
                  </Link>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${styles.bg} ${styles.text}`}>
                      {getFileTypeLabel(file.fileType)}
                    </span>
                    <span>{formatDate(file.importedAt)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/view/${file.id}`}
                    className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => onDelete(file.id)}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
