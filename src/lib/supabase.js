import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check your .env file.');
  console.error('VITE_SUPABASE_URL:', supabaseUrl);
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set' : 'Missing');
}

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      global: {
        fetch: (url, options = {}) => {
          return fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
        },
      },
    })
  : null;

// Helper function to wrap queries with timeout
export const withTimeout = (promise, ms = 10000) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Request timeout')), ms);
  });
  
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
};

// Department configuration
export const DEPARTMENTS = [
  { code: 'ACC', name: 'Accounting' },
  { code: 'ACS', name: 'Art & Creative Support' },
  { code: 'BAS', name: 'Business & Administration Services' },
  { code: 'BID', name: 'Business & Innovation Development' },
  { code: 'CFC', name: 'Corporate Finance Controller' },
  { code: 'CMC', name: 'Corporate Marketing Communication' },
  { code: 'CT', name: 'Corporate Travel' },
  { code: 'GA', name: 'General Affairs' },
  { code: 'HR', name: 'Human Resources' },
  { code: 'PD', name: 'Product Development' },
  { code: 'SO', name: 'Sales Operation' },
  { code: 'SS', name: 'Strategic Sourcing' },
  { code: 'TEP', name: 'Tour and Event Planning' },
];

// Simplified workflow: Staff can directly mark Achieved
// Internal Review and Waiting Approval are legacy/system states
// Blocked: Staff reports an obstacle (sets is_blocked flag)
// Escalation is handled via attention_level metadata on Blocked items
export const STATUS_OPTIONS = ['Open', 'On Progress', 'Blocked', 'Achieved', 'Not Achieved'];

// Legacy status options (for display purposes only)
export const ALL_STATUS_OPTIONS = ['Open', 'On Progress', 'Blocked', 'Internal Review', 'Waiting Approval', 'Achieved', 'Not Achieved'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const REPORT_FORMATS = ['Monthly Report', 'Weekly Update', 'Quarterly Review', 'Annual Report'];

// Blocker category options for the Blocked status
export const BLOCKER_CATEGORIES = ['Internal', 'External', 'Budget', 'Approval'];

// Attention level options for escalation severity
export const ATTENTION_LEVELS = [
  { value: 'Standard', label: 'Standard (I am handling it)' },
  { value: 'Leader', label: 'Leader Attention (Need Supervisor help)' },
  { value: 'Management_BOD', label: 'Management / BOD Attention (CRITICAL)' },
];
