'use client';

import Link from 'next/link';
import { ReactNode, useState, useMemo } from 'react';
import { ImportedFile, FileType } from '@/lib/storage';

interface FileListProps {
  files: ImportedFile[];
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

type SortField = 'name' | 'type' | 'date';
type SortDirection = 'asc' | 'desc';

function getFileTypeIcon(type: FileType): ReactNode {
  const icons = {
    schedule: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    invoice: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
      </svg>
    ),
    healthcare: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    unknown: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  };
  return icons[type];
}

function getFileTypeStyles(type: FileType): { bg: string; text: string } {
  const styles: Record<FileType, { bg: string; text: string }> = {
    schedule: { bg: 'bg-blue-100', text: 'text-blue-700' },
    invoice: { bg: 'bg-green-100', text: 'text-green-700' },
    healthcare: { bg: 'bg-pink-100', text: 'text-pink-700' },
    unknown: { bg: 'bg-gray-100', text: 'text-gray-700' },
  };
  return styles[type];
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
  });
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function SortIcon({ field, currentField, direction }: { field: SortField; currentField: SortField; direction: SortDirection }) {
  if (field !== currentField) {
    return (
      <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return direction === 'asc' ? (
    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function FileList({ files, onDelete, onRename }: FileListProps) {
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.displayName.localeCompare(b.displayName);
          break;
        case 'type':
          comparison = a.fileType.localeCompare(b.fileType);
          break;
        case 'date':
          comparison = new Date(a.importedAt).getTime() - new Date(b.importedAt).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [files, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'date' ? 'desc' : 'asc');
    }
  };

  const handleStartEdit = (file: ImportedFile) => {
    setEditingId(file.id);
    setEditName(file.displayName);
  };

  const handleSaveEdit = (id: string) => {
    if (editName.trim()) {
      onRename(id, editName.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleSaveEdit(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

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
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-3 text-left">
              <button
                onClick={() => handleSort('name')}
                className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
              >
                Name
                <SortIcon field="name" currentField={sortField} direction={sortDirection} />
              </button>
            </th>
            <th className="px-4 py-3 text-left">
              <button
                onClick={() => handleSort('type')}
                className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
              >
                Type
                <SortIcon field="type" currentField={sortField} direction={sortDirection} />
              </button>
            </th>
            <th className="px-4 py-3 text-left">
              <button
                onClick={() => handleSort('date')}
                className="flex items-center gap-1 text-xs font-semibold text-gray-600 uppercase tracking-wider hover:text-gray-900"
              >
                Imported
                <SortIcon field="date" currentField={sortField} direction={sortDirection} />
              </button>
            </th>
            <th className="px-4 py-3 text-right">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Actions
              </span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {sortedFiles.map((file) => {
            const styles = getFileTypeStyles(file.fileType);
            const isEditing = editingId === file.id;

            return (
              <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded ${styles.bg} ${styles.text}`}>
                      {getFileTypeIcon(file.fileType)}
                    </div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => handleSaveEdit(file.id)}
                        onKeyDown={(e) => handleKeyDown(e, file.id)}
                        autoFocus
                        className="flex-1 px-2 py-1 text-sm text-gray-900 font-medium border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <Link
                        href={`/view/${file.id}`}
                        className="text-sm text-gray-900 font-medium hover:text-blue-600"
                      >
                        {file.displayName}
                      </Link>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles.bg} ${styles.text}`}>
                    {getFileTypeLabel(file.fileType)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm text-gray-900">{formatDate(file.importedAt)}</div>
                  <div className="text-xs text-gray-500">{formatTime(file.importedAt)}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => handleStartEdit(file)}
                      className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                      title="Rename"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <Link
                      href={`/view/${file.id}`}
                      className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                      title="View"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </Link>
                    <button
                      onClick={() => onDelete(file.id)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
