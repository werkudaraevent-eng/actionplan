import { MentionsInput, Mention } from 'react-mentions';
import { useMentionUsers } from '../../hooks/useMentionUsers';
import { useCompanyContext } from '../../context/CompanyContext';

/**
 * MentionInput - Textarea with @mention autocomplete
 * 
 * Styled to match our Tailwind textarea design.
 * Uses react-mentions with custom inline styles to override defaults.
 */

// Override react-mentions default styles to match our UI
const mentionsInputStyle = {
  control: {
    fontSize: 14,
    lineHeight: '1.5',
  },
  '&multiLine': {
    control: {
      minHeight: 60,
    },
    highlighter: {
      padding: '8px 12px',
      border: '1px solid transparent',
      borderRadius: 8,
    },
    input: {
      padding: '8px 12px',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      outline: 'none',
      fontSize: 14,
      lineHeight: '1.5',
      backgroundColor: '#fff',
      overflow: 'auto',
    },
  },
  suggestions: {
    list: {
      backgroundColor: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
      fontSize: 13,
      maxHeight: 200,
      overflow: 'auto',
      zIndex: 10000,
    },
    item: {
      padding: '8px 12px',
      borderBottom: '1px solid #f3f4f6',
      cursor: 'pointer',
      '&focused': {
        backgroundColor: '#f0fdfa',
      },
    },
  },
};

// Style for the highlighted mention text inside the input
const mentionStyle = {
  backgroundColor: '#d1fae5',
  borderRadius: 4,
  padding: '1px 2px',
  fontWeight: 600,
  color: '#065f46',
  position: 'relative',
  zIndex: 1,
};

export default function MentionInput({
  value,
  onChange,
  placeholder = 'Write a comment...',
  disabled = false,
  rows = 2,
  inputRef,
}) {
  const { activeCompanyId } = useCompanyContext();
  const { users } = useMentionUsers(activeCompanyId);

  // Custom suggestion renderer
  const renderSuggestion = (suggestion, search, highlightedDisplay, index, focused) => (
    <div className={`flex items-center gap-2 ${focused ? 'bg-teal-50' : ''}`}>
      <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-teal-700">
          {suggestion.display?.charAt(0)?.toUpperCase() || '?'}
        </span>
      </div>
      <div className="min-w-0">
        <span className="text-sm font-medium text-gray-800 block truncate">
          {highlightedDisplay}
        </span>
        {suggestion.department && (
          <span className="text-[10px] text-gray-400">{suggestion.department}</span>
        )}
      </div>
    </div>
  );

  return (
    <MentionsInput
      value={value}
      onChange={(e, newValue) => onChange(newValue)}
      placeholder={placeholder}
      disabled={disabled}
      style={mentionsInputStyle}
      inputRef={inputRef}
      rows={rows}
      a11ySuggestionsListLabel="Suggested users"
      allowSpaceInQuery
    >
      <Mention
        trigger="@"
        data={users}
        markup="@[__display__](__id__)"
        style={mentionStyle}
        displayTransform={(id, display) => `@${display}`}
        renderSuggestion={renderSuggestion}
        appendSpaceOnAdd
      />
    </MentionsInput>
  );
}
