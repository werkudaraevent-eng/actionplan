import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // The property-based component tests render a React tree per generated case and take
    // three to four seconds each on an idle machine. Vitest's five-second default left no
    // headroom, so the suite failed at random whenever anything else was competing for the
    // CPU — a local Supabase stack, a dev server — and reported a green suite on a rerun.
    // Nothing here is slow because of a defect; the budget was simply too tight.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
