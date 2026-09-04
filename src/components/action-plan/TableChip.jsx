/**
 * Two chip shapes, because a pill is only correct for one of them.
 *
 * `rounded-full` resolves to half the element's height. On a single line that is about
 * 12px, comfortably inside the horizontal padding, and the shape reads as one label. On
 * three wrapped lines the height triples, the radius becomes ~30px, and the corner arc
 * cuts straight through the first and last lines of text while the padding still stops at
 * 8px. The table used the pill recipe for all three of its chip columns regardless of how
 * long the content ran, so "End to End Business Process Implementation" collided with its
 * own container.
 *
 * The rule the two components encode: a chip's radius must stay smaller than its
 * horizontal padding, or the curve eats the words. A pill can only honour that by never
 * wrapping.
 */

/** A short term from a fixed vocabulary: a division code, a priority level. Never wraps,
 *  which is the condition that makes the pill shape safe. */
export function CodeChip({ children, className = '', title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}

/** A phrase that can run long and wrap. Radius 6px against 10px of padding, so the corner
 *  never reaches a glyph, and looser leading so wrapped lines do not read as one mass. */
export function PhraseChip({ children, className = '', title }) {
  return (
    <span
      title={title}
      className={`inline-block px-2.5 py-1 rounded-md text-xs font-medium leading-relaxed ${className}`}
    >
      {children}
    </span>
  );
}
