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
  { code: 'BAS', name: 'Business & Administration Services' },
  { code: 'PD', name: 'Product Development' },
  { code: 'CFC', name: 'Corporate Finance Controller' },
  { code: 'SS', name: 'Strategic Sourcing' },
  { code: 'ACC', name: 'Accounting' },
  { code: 'HR', name: 'Human Resources' },
  { code: 'BID', name: 'Business & Innovation Development' },
  { code: 'TEP', name: 'Tour and Event Planning' },
  { code: 'GA', name: 'General Affairs' },
  { code: 'ACS', name: 'Art & Creative Support' },
  { code: 'SO', name: 'Sales Operation' },
];

export const STATUS_OPTIONS = ['Pending', 'On Progress', 'Waiting Approval', 'Achieved', 'Not Achieved'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const REPORT_FORMATS = ['Monthly Report', 'Weekly Update', 'Quarterly Review', 'Annual Report'];
