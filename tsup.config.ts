import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // React components and hooks. They only work in the browser, so the
    // bundle is marked as a client module for React Server Components.
    entry: { index: 'src/react/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    external: ['react', 'react-dom'],
    banner: { js: "'use client';" },
    clean: true,
  },
  {
    // Framework-independent browser code, and the server-side verification
    entry: { core: 'src/core/index.ts', server: 'src/server.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: false,
  },
]);
