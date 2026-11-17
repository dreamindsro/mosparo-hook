import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Component and script-loader tests need a DOM. The server tests opt out
    // with a `@vitest-environment node` docblock.
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    unstubEnvs: true,
  },
});
