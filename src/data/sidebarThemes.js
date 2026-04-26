/**
 * Sidebar theme configurations.
 * Each theme maps semantic roles to Tailwind classes.
 */
export const SIDEBAR_THEMES = {
  teal: {
    id: 'teal',
    label: 'Teal',
    icon: 'Sun',
    preview: 'bg-teal-700',
    container: 'bg-teal-800',
    headerBorder: 'border-teal-700',
    userCard: 'bg-teal-700/40',
    textPrimary: 'text-white',
    textSecondary: 'text-teal-300',
    textMuted: 'text-teal-100',
    navActive: 'bg-teal-600 text-white',
    navHover: 'hover:bg-teal-700/50 hover:text-white',
    navText: 'text-teal-100',
    selectBg: 'bg-teal-900/80',
    selectBorder: 'border-teal-600',
    selectText: 'text-teal-100',
    badgeBg: 'bg-teal-900/30',
    badgeText: 'text-teal-300',
    scrollbar: '[&::-webkit-scrollbar-thumb]:bg-teal-600',
    divider: 'border-teal-700/50',
    logoFallbackFrom: 'from-teal-500',
    logoFallbackTo: 'to-teal-700',
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    icon: 'Moon',
    preview: 'bg-slate-700',
    container: 'bg-slate-900',
    headerBorder: 'border-slate-700',
    userCard: 'bg-slate-700/40',
    textPrimary: 'text-white',
    textSecondary: 'text-slate-400',
    textMuted: 'text-slate-300',
    navActive: 'bg-slate-700 text-white',
    navHover: 'hover:bg-slate-700/50 hover:text-white',
    navText: 'text-slate-300',
    selectBg: 'bg-slate-800',
    selectBorder: 'border-slate-600',
    selectText: 'text-slate-300',
    badgeBg: 'bg-slate-800',
    badgeText: 'text-slate-400',
    scrollbar: '[&::-webkit-scrollbar-thumb]:bg-slate-600',
    divider: 'border-slate-700/50',
    logoFallbackFrom: 'from-slate-600',
    logoFallbackTo: 'to-slate-800',
  },
  navy: {
    id: 'navy',
    label: 'Navy',
    icon: 'Monitor',
    preview: 'bg-indigo-700',
    container: 'bg-indigo-950',
    headerBorder: 'border-indigo-800',
    userCard: 'bg-indigo-800/40',
    textPrimary: 'text-white',
    textSecondary: 'text-indigo-300',
    textMuted: 'text-indigo-200',
    navActive: 'bg-indigo-700 text-white',
    navHover: 'hover:bg-indigo-800/50 hover:text-white',
    navText: 'text-indigo-200',
    selectBg: 'bg-indigo-900/80',
    selectBorder: 'border-indigo-700',
    selectText: 'text-indigo-200',
    badgeBg: 'bg-indigo-900/30',
    badgeText: 'text-indigo-300',
    scrollbar: '[&::-webkit-scrollbar-thumb]:bg-indigo-700',
    divider: 'border-indigo-800/50',
    logoFallbackFrom: 'from-indigo-600',
    logoFallbackTo: 'to-indigo-800',
  },
};

// Sandbox always uses amber regardless of theme
export const SANDBOX_THEME = {
  id: 'sandbox',
  label: 'Sandbox',
  container: 'bg-amber-800',
  headerBorder: 'border-amber-700',
  userCard: 'bg-amber-700/40',
  textPrimary: 'text-white',
  textSecondary: 'text-amber-300',
  textMuted: 'text-amber-100',
  navActive: 'bg-amber-600 text-white',
  navHover: 'hover:bg-amber-700/50 hover:text-white',
  navText: 'text-amber-100',
  selectBg: 'bg-amber-900/80',
  selectBorder: 'border-amber-600',
  selectText: 'text-amber-100',
  badgeBg: 'bg-amber-900/30',
  badgeText: 'text-amber-300',
  scrollbar: '[&::-webkit-scrollbar-thumb]:bg-amber-600',
  divider: 'border-amber-700/50',
  logoFallbackFrom: 'from-amber-500',
  logoFallbackTo: 'to-amber-700',
};

export const DEFAULT_THEME = 'teal';

export function getSavedTheme() {
  return localStorage.getItem('sidebar_theme') || DEFAULT_THEME;
}

export function saveTheme(themeId) {
  localStorage.setItem('sidebar_theme', themeId);
}
