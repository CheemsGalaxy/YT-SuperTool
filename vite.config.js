import { defineConfig } from 'vite';

export default defineConfig({
  root: process.cwd(),
  build: {
    emptyOutDir: false,
    sourcemap: false,
    target: 'es2020'
  }
});
