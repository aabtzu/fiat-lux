import Link from 'next/link';
import Dashboard from '@/components/Dashboard';
import { getStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const storage = await getStorage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Fiat Lux</h1>
            <p className="text-gray-600 mt-2">
              Shedding light on information
            </p>
          </div>
          <Link
            href="/about"
            className="text-gray-500 hover:text-gray-700 transition-colors"
            title="About Fiat Lux"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </Link>
        </header>

        <Dashboard initialFiles={storage.files} />
      </div>
    </div>
  );
}
