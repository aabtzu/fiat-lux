'use client';

import { useState } from 'react';
import FileUpload from './FileUpload';
import FileList from './FileList';
import { ImportedFile } from '@/lib/userStorage';

interface DashboardProps {
  initialFiles: ImportedFile[];
  sharedFiles?: ImportedFile[];
}

export default function Dashboard({ initialFiles, sharedFiles = [] }: DashboardProps) {
  const [files, setFiles] = useState<ImportedFile[]>(initialFiles);
  const [shared, setShared] = useState<ImportedFile[]>(sharedFiles);
  const [activeTab, setActiveTab] = useState<'owned' | 'shared'>('owned');

  const refreshFiles = async () => {
    try {
      const response = await fetch('/api/files');
      if (response.ok) {
        const data = await response.json();
        setFiles(data.owned || []);
        setShared(data.shared || []);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      const response = await fetch(`/api/files?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      const response = await fetch('/api/files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, displayName: newName }),
      });

      if (response.ok) {
        setFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, displayName: newName } : f))
        );
      }
    } catch (error) {
      console.error('Error renaming file:', error);
    }
  };

  return (
    <div className="space-y-6">
      <FileUpload onUploadComplete={refreshFiles} />

      {/* Tabs */}
      {shared.length > 0 && (
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('owned')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'owned'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            My Files ({files.length})
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'shared'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Shared with me ({shared.length})
          </button>
        </div>
      )}

      {/* File Lists */}
      {activeTab === 'owned' ? (
        <FileList
          files={files}
          onDelete={handleDelete}
          onRename={handleRename}
          showShareButton
        />
      ) : (
        <FileList
          files={shared}
          onDelete={() => {}}
          onRename={() => {}}
          isSharedView
        />
      )}
    </div>
  );
}
