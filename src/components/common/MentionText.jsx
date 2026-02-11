import { parseMentions } from '../../utils/mentionUtils';

/**
 * MentionText - Renders text with @mentions highlighted
 * 
 * Converts @[Name](id) markup into styled spans.
 * Falls back to plain text if no mentions found.
 */
export default function MentionText({ text, className = '' }) {
  if (!text) return null;

  const parts = parseMentions(text);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <span
            key={`${part.id}-${i}`}
            className="text-emerald-700 font-semibold bg-emerald-50 px-1 rounded"
          >
            @{part.display}
          </span>
        )
      )}
    </span>
  );
}
