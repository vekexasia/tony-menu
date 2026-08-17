import { defineConfig } from 'vitest/config';
import codspeedPlugin from '@codspeed/vitest-plugin';

export default defineConfig({
  plugins: [codspeedPlugin()],
  test: {
    environment: 'node',
    benchmark: {
      include: ['src/**/*.bench.ts'],
    },
  },
  resolve: {
    conditions: ['node'],
  },
});
