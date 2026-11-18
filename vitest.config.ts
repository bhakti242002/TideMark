import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests run in Vite's server environment. Putting our condition first makes
  // workspace imports like '@tidemark/engine' resolve to src/, so tests never
  // depend on a build. Node and tsc don't know the condition and use dist/.
  // Setting conditions replaces Vite's defaults, so they are spread back in.
  ssr: {
    resolve: {
      conditions: ['@tidemark/source', ...defaultServerConditions],
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tools/**/*.test.ts'],
    setupFiles: ['./tools/vitest/setup.ts'],
  },
});
