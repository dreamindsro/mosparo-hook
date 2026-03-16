import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    external: ['react', 'react-dom'],
    banner: { js: "'use client';" },
    clean: true,
  },
  {
    entry: ['src/server.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    external: ['react', 'react-dom', '@mosparo/api-client'],
    clean: false,
  },
]);
