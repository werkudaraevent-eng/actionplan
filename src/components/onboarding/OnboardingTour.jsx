import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowLeft, ArrowRight, Check } from 'lucide-react';

const PADDING = 8;
const CARD_WIDTH = 340;
const GAP = 14;

const rectOf = (name) => {
  if (!name) return null;
  const el = document.querySelector(`[data-tour="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // A target that is rendered but collapsed cannot be pointed at meaningfully.
  if (r.width === 0 || r.height === 0) return null;
  return r;
};

// Place the card beside the highlight, or centred when the step has no target. Falls
// back through below → above → right → left so a target near an edge still gets a card
// that stays on screen.
function placeCard(rect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect) {
    return { top: Math.max(24, vh / 2 - 120), left: Math.max(16, vw / 2 - CARD_WIDTH / 2) };
  }

  const below = rect.bottom + GAP;
  const above = rect.top - GAP;
  const clampLeft = (value) => Math.min(Math.max(16, value), Math.max(16, vw - CARD_WIDTH - 16));

  if (below + 190 < vh) return { top: below, left: clampLeft(rect.left) };
  if (above - 190 > 0) return { top: Math.max(16, above - 190), left: clampLeft(rect.left) };
  if (rect.right + GAP + CARD_WIDTH < vw) return { top: Math.max(16, rect.top), left: rect.right + GAP };
  return { top: Math.max(16, rect.top), left: clampLeft(rect.left - CARD_WIDTH - GAP) };
}

/**
 * A first-run introduction that points at the real interface rather than screenshots, so
 * what somebody is told matches what is in front of them.
 *
 * Steps name a `data-tour` target. Any step whose target is missing from the current page
 * is dropped before the tour starts — roles land on different pages, and a spotlight over
 * empty space teaches nothing.
 *
 * @param {Array}    steps    — from getOnboardingSteps()
 * @param {Function} onFinish — completed all the way through
 * @param {Function} onSkip   — dismissed early; both should stop it reappearing
 */
export default function OnboardingTour({ steps = [], onFinish, onSkip }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);

  // Resolved once, on mount: dropping a step mid-tour would renumber the ones after it
  // and make "3 of 5" jump around while somebody is reading.
  const visibleSteps = useMemo(
    () => steps.filter((step) => !step.target || rectOf(step.target)),
    [steps]
  );

  const step = visibleSteps[index];
  const isLast = index === visibleSteps.length - 1;

  const measure = useCallback(() => {
    setRect(step?.target ? rectOf(step.target) : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return undefined;
    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });

    // Let the smooth scroll land before measuring, or the highlight sits where the
    // element used to be.
    const settle = setTimeout(() => {
      measure();
      setReady(true);
    }, el ? 320 : 0);

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step, measure]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onSkip?.();
      if (event.key === 'ArrowRight' && !isLast) setIndex((i) => i + 1);
      if (event.key === 'ArrowLeft' && index > 0) setIndex((i) => i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, isLast, onSkip]);

  if (!step || visibleSteps.length === 0) return null;

  const card = placeCard(rect);

  return createPortal(
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-label="Panduan penggunaan">
      {/* One transparent box over the target; the huge spread shadow darkens everything
          else. Simpler than masking, and it keeps the real element visible and crisp. */}
      {rect ? (
        <div
          className="absolute rounded-lg pointer-events-none transition-all duration-200"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.66)',
            outline: '2px solid rgba(255,255,255,0.9)',
            opacity: ready ? 1 : 0,
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: 'rgba(15, 23, 42, 0.66)' }} />
      )}

      {/* Swallows clicks on the darkened area so nothing is triggered by accident while
          the tour is up. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        className="absolute bg-white rounded-xl shadow-2xl p-5 transition-all duration-200"
        style={{ top: card.top, left: card.left, width: CARD_WIDTH, opacity: ready ? 1 : 0 }}
      >
        <button
          type="button"
          onClick={onSkip}
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-700 rounded"
          aria-label="Lewati panduan"
        >
          <X className="w-4 h-4" />
        </button>

        <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
          Langkah {index + 1} dari {visibleSteps.length}
        </p>
        <h3 className="text-base font-bold text-gray-900 mt-1 pr-6">{step.title}</h3>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">{step.body}</p>

        <div className="flex items-center gap-1 mt-4" aria-hidden="true">
          {visibleSteps.map((s, i) => (
            <span
              key={s.title}
              className={`h-1 rounded-full transition-all ${i === index ? 'w-5 bg-blue-700' : 'w-1.5 bg-gray-300'}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 mt-4">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Lewati
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex((i) => i - 1)}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <ArrowLeft className="w-4 h-4" /> Kembali
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? onFinish?.() : setIndex((i) => i + 1))}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
            >
              {isLast ? <><Check className="w-4 h-4" /> Selesai</> : <>Lanjut <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
