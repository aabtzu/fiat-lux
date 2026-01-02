import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-gray-600 hover:text-gray-800 mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
        </header>

        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-amber-500 to-yellow-400 px-8 py-12 text-center">
            <h1 className="text-4xl font-bold text-white mb-2">Fiat Lux</h1>
            <p className="text-amber-100 text-lg italic">&ldquo;Let there be light&rdquo;</p>
          </div>

          <div className="px-8 py-8 space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-gray-800 mb-3">The Motto</h2>
              <p className="text-gray-600 leading-relaxed">
                <span className="font-medium text-amber-600">Fiat Lux</span> is the motto of the
                University of California, Berkeley. These Latin words from Genesis 1:3 translate
                to &ldquo;Let there be light&rdquo; — a call to illuminate, to understand, and to
                bring clarity where there was once darkness.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-800 mb-3">Our Inspiration</h2>
              <p className="text-gray-600 leading-relaxed">
                In our daily lives, we encounter information that&apos;s difficult to parse:
                dense schedules, cryptic invoices, complex healthcare bills. These documents
                hold important details, but their formats often obscure rather than reveal.
              </p>
              <p className="text-gray-600 leading-relaxed mt-3">
                This tool exists to <span className="font-medium">shed light</span> on that
                information — to transform raw data into clear, visual summaries that make
                understanding effortless. Just as light reveals what shadows hide, we aim to
                make the invisible visible.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-800 mb-3">What We Visualize</h2>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <span><strong>Schedules</strong> — Weekly calendars that show your time at a glance</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                    </svg>
                  </span>
                  <span><strong>Invoices</strong> — Clear breakdowns of charges and totals</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-500 mt-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </span>
                  <span><strong>Healthcare bills</strong> — Demystified medical costs and coverage</span>
                </li>
              </ul>
            </section>

            <div className="pt-4 border-t border-gray-200 text-center">
              <p className="text-gray-400 text-sm">
                Built with the belief that clarity is a form of kindness.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
