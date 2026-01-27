import { notFound } from 'next/navigation';
import Link from 'next/link';
import { validateShareToken } from '@/lib/sharing';
import { getFileById } from '@/lib/userStorage';
import SharedInteractiveView from '@/components/SharedInteractiveView';

interface SharedPageProps {
  params: Promise<{ token: string }>;
}

export default async function SharedPage({ params }: SharedPageProps) {
  const { token } = await params;

  const shareInfo = validateShareToken(token);
  if (!shareInfo) {
    notFound();
  }

  const file = getFileById(shareInfo.fileId);
  if (!file) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-xl font-bold text-gray-800">
                Fiat Lux
              </Link>
              <div className="h-6 w-px bg-gray-300" />
              <span className="text-gray-600 text-sm">Shared View</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {shareInfo.canEdit ? 'Can edit' : 'View only'}
              </span>
              <Link
                href="/login"
                className="text-sm text-blue-500 hover:text-blue-600"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 overflow-hidden">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-gray-800">{file.displayName}</h1>
        </div>

        <div className="flex-1 min-h-0">
          <SharedInteractiveView
            fileId={file.id}
            fileName={file.displayName}
            token={token}
            canEdit={shareInfo.canEdit}
            initialVisualization={file.visualization}
            initialChatHistory={file.chatHistory}
            initialSourceFiles={file.sourceFiles}
          />
        </div>
      </div>
    </main>
  );
}
