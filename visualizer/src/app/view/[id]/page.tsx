import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFile } from '@/lib/storage';
import InteractiveView from '@/components/InteractiveView';

interface ViewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ViewPage({ params }: ViewPageProps) {
  const { id } = await params;
  const file = await getFile(id);

  if (!file) {
    notFound();
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-100 to-slate-200 pt-4 px-4 pb-2">
      <div className="max-w-[1600px] mx-auto w-full flex flex-col flex-1 min-h-0">
        <header className="mb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/"
                className="inline-flex items-center text-gray-600 hover:text-gray-800 mb-2"
              >
                <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Dashboard
              </Link>
              <h1 className="text-2xl font-bold text-gray-800">{file.displayName}</h1>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-sm">
                {file.fileType}
              </span>
              <p className="text-gray-500 text-xs mt-1">
                {file.originalName}
              </p>
            </div>
          </div>
        </header>

        <InteractiveView
          fileId={id}
          fileName={file.displayName}
          initialSourceFiles={file.sourceFiles || []}
          initialPrompt={file.initialPrompt}
        />
      </div>
    </div>
  );
}
