/**
 * Mention utilities for @mention system
 * 
 * Markup format: @[DisplayName](userId)
 * This is the standard react-mentions markup pattern.
 */

// Regex to match @[display](id) patterns
const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * parseMentions - Converts raw mention markup into React elements
 * Returns an array of strings and JSX spans for rendering
 * 
 * @param {string} text - Raw text with @[Name](id) markup
 * @returns {Array} Array of strings and { type: 'mention', display, id } objects
 */
export function parseMentions(text) {
  if (!text) return [text];

  const parts = [];
  let lastIndex = 0;
  let match;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(text)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add the mention object
    parts.push({ type: 'mention', display: match[1], id: match[2] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * extractMentionIds - Extracts all unique user IDs from mention markup
 * 
 * @param {string} text - Raw text with @[Name](id) markup
 * @returns {string[]} Array of unique user UUIDs
 */
export function extractMentionIds(text) {
  if (!text) return [];
  const ids = new Set();
  let match;

  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    ids.add(match[2]);
  }

  return [...ids];
}

/**
 * getPlainTextFromMentions - Strips markup, returns readable text
 * e.g. "Hey @[Hanung](uuid) check this" → "Hey @Hanung check this"
 */
export function getPlainTextFromMentions(text) {
  if (!text) return text;
  return text.replace(MENTION_REGEX, '@$1');
}
