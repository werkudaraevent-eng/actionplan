/**
 * Sidebar theme configurations.
 * Each theme maps semantic roles to Tailwind classes.
 *
 * Brand colors:
 * - Corporate Blue: #02378D
 * - Dark: #292D30
 * - Light: #EFEFEF
 */
export const SIDEBAR_THEMES = {
  corporate: {
    id: 'corporate',
    label: 'Corporate',
    icon: 'Building2',
    preview: 'bg-[#02378D]',
    container: 'bg-[#02378D]',
    headerBorder: 'border-[#01296a]',
    userCard: 'bg-white/10',
    textPrimary: 'text-white',
    textSecondary: 'text-blue-200',
    textMuted: 'text-blue-100',
    navActive: 'bg-white/20 text-white',
    navHover: 'hover:bg-white/10 hover:text-white',
    navText: 'text-blue-100',
    selectBg: 'bg-[#01296a]',
    selectBorder: 'border-blue-400/30',
    selectText: 'text-blue-100',
    badgeBg: 'bg-[#01296a]/60',
    badgeText: 'text-blue-200',
    scrollbar: '[&::-webkit-scrollbar-thumb]:bg-blue-400/40',
    divider: 'border-white/10',
    logoFallbackFrom: 'from-blue-400',
    logoFallbackTo: 'to-[#02378D]',
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    icon: 'Moon',
    preview: 'bg-[#292D30]',
    container: 'bg-[#292D30]',
    headerBorder: 'border-[#3a3f43]',
    userCard: 'bg-white/8',
    textPrimary: 'text-white',
    textSecondary: 'text-gray-400',
    textMuted: 'text-gray-300',
    navActive: 'bg-white/15 text-white',
    navHover: 'hover:bg-white/8 hover:text-white',
    navText: 'text-gray-300',
    selectBg: 'bg-[#1e2124]',
    selectBorder: 'border-gray-600/40',
    selectText: 'text-gray-300',
    badgeBg: 'bg-white/8',
    badgeText: 'text-gray-400',
    scrollbar: '[&::-webkit-scrollbar-thumb]:bg-gray-600',
    divider: 'border-white/8',
    logoFallbackFrom: 'from-gray-500',
    logoFallbackTo: 'to-gray-700',
  },
  light: {
    id: 'light',
    label: 'Light',
    icon: 'Sun',
    preview: 'bg-[#EFEFEF]',
    container: 'bg-[#EFEFEF]',
    headerBorder: 'border-gray-300',
    userCard: 'bg-black/5',
    textPrimary: 'text-gray-900',
    textSecondary: 'text-gray-500',
    textMuted: 'text-gray-600',
    navActive: 'bg-[#02378D] text-white',
    navHover: 'hover:bg-black/5 hover:text-gray-900',
    navText: 'text-gray-700',
    selectBg: 'bg-white',
    selectBorder: 'border-gray-300',
    selectText: 'text-gray-700',
    badgeBg: 'bg-black/5',
    badgeText: 'text-gray-500',
    scrollbar: '[&::-webkit-scrollbar-thumb]:bg-gray-400',
    divider: 'border-gray-300/60',
    logoFallbackFrom: 'from-[#02378D]',
    logoFallbackTo: 'to-blue-600',
  },
};

// Sandbox always uses amber regardless of theme
export const SANDBOX_THEME = {
  id: 'sandbox',
  label: 'Sandbox',
  icon: 'FlaskConical',
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

export const DEFAULT_THEME = 'corporate';

export function getSavedTheme() {
  const saved = localStorage.getItem('sidebar_theme');
  // Validate saved theme still exists (handles renamed/removed themes)
  if (saved && SIDEBAR_THEMES[saved]) return saved;
  return DEFAULT_THEME;
}

export function saveTheme(themeId) {
  localStorage.setItem('sidebar_theme', themeId);
}

// Collapsed sidebar preference. Kept beside the theme because it is the same kind of
// thing: a per-device display choice, not something that belongs to the account. Someone
// who narrows the sidebar on a small laptop should not have it narrowed on their desktop.
export function getSavedSidebarCollapsed() {
  return localStorage.getItem('sidebar_collapsed') === 'true';
}

export function saveSidebarCollapsed(collapsed) {
  localStorage.setItem('sidebar_collapsed', collapsed ? 'true' : 'false');
}
