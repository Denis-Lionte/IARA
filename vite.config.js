import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative paths so assets load correctly on GitHub Pages
  base: './', 
  build: {
    outDir: 'dist',
  } 
});