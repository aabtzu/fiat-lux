import Link from 'next/link';
import Dashboard from '@/components/Dashboard';
import UserMenu from '@/components/UserMenu';
import { getCurrentUser } from '@/lib/auth';
import { getFilesForUser, getFilesSharedWithUser } from '@/lib/userStorage';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getCurrentUser();

  // This should never happen due to middleware, but handle it anyway
  if (!user) {
    return null;
  }

  const ownedFiles = getFilesForUser(user.id);
  const sharedFiles = getFilesSharedWithUser(user.id);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex items-start justify-between">
          <h1 className="text-3xl font-bold text-gray-800">
            Fiat Lux
            <span className="text-base font-normal text-gray-400 ml-3">shedding light on information</span>
          </h1>
          <div className="flex items-center gap-4">
            <Link
              href="/about"
              className="text-gray-500 hover:text-gray-700 transition-colors"
              title="About Fiat Lux"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </Link>
            <UserMenu user={user} />
          </div>
        </header>

        <Dashboard initialFiles={ownedFiles} sharedFiles={sharedFiles} />
      </div>
    </div>
  );
}
