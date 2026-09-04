import { useMemo, useState } from 'react';
import { Search, Info, BookOpen, PlayCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getGuideSections, searchGuide } from '../data/userGuide';

/**
 * The procedures, written down and searchable.
 *
 * Deliberately not a tour. A tour runs once and points at where things are; these are the
 * answers somebody needs while doing the work, and needs again next month. Sections are
 * filtered by role so nobody reads instructions for a screen they cannot open.
 */
export default function UserGuidePage({ onRestartTour }) {
  const { profile } = useAuth();
  const [query, setQuery] = useState('');

  const sections = useMemo(() => getGuideSections(profile?.role), [profile?.role]);
  const results = useMemo(() => searchGuide(sections, query), [sections, query]);

  return (
    <div className="h-full flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-4 shrink-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-gray-500" />
              Panduan
            </h1>
            <p className="text-sm text-gray-500 mt-1">Cara mengerjakan hal-hal yang sering ditanyakan</p>
          </div>
          {onRestartTour && (
            <button
              type="button"
              onClick={onRestartTour}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm text-blue-700 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100"
            >
              <PlayCircle className="w-4 h-4" />
              Putar ulang perkenalan
            </button>
          )}
        </div>

        <div className="relative mt-4 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari — misalnya bukti, tutup bulan, divisi"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 outline-none"
            aria-label="Cari panduan"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {results.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-600">Tidak ada yang cocok dengan &ldquo;{query}&rdquo;.</p>
            <button type="button" onClick={() => setQuery('')} className="mt-2 text-sm text-blue-700 hover:underline">
              Tampilkan semua
            </button>
          </div>
        ) : (
          <div className="max-w-3xl space-y-4">
            {results.map((section) => (
              <section key={section.id} id={section.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="text-lg font-bold text-gray-900">{section.title}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{section.summary}</p>

                {section.steps && (
                  <ol className="mt-3 space-y-2">
                    {section.steps.map((stepText, i) => (
                      <li key={stepText} className="flex gap-3 text-sm text-gray-700">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <span className="flex-1">{stepText}</span>
                      </li>
                    ))}
                  </ol>
                )}

                {section.table && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm border border-gray-100 rounded-lg">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          {section.table.head.map((cell) => (
                            <th key={cell} className="text-left font-semibold px-3 py-2">{cell}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {section.table.rows.map((row) => (
                          <tr key={row[0]}>
                            <td className="px-3 py-2 font-medium text-gray-800 align-top whitespace-nowrap">{row[0]}</td>
                            <td className="px-3 py-2 text-gray-600">{row[1]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* The thing people get wrong, kept visually distinct from the steps so it
                    is not skimmed past as more of the same. */}
                {section.note && (
                  <p className="mt-3 flex gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
                    <span>{section.note}</span>
                  </p>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
