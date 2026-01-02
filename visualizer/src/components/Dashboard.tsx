'use client';

import { useState, useEffect } from 'react';
import FileUpload from './FileUpload';
import FileList from './FileList';
import { ImportedFile } from '@/lib/storage';

interface DashboardProps {
  initialFiles: ImportedFile[];
}

export default function Dashboard({ initialFiles }: DashboardProps) {
  const [files, setFiles] = useState<ImportedFile[]>(initialFiles);

  const refreshFiles = async () => {
    try {
      const response = await fetch('/api/files');
      if (response.ok) {
        const data = await response.json();
        setFiles(data);
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
      <FileList files={files} onDelete={handleDelete} onRename={handleRename} />
    </div>
  );
}
