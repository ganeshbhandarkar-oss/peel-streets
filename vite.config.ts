import { defineConfig } from 'vite';

// GitHub Pages serves the project at https://<user>.github.io/peel-streets/
export default defineConfig({
  base: '/peel-streets/',
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as any);
