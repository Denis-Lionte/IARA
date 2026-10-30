import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative paths so assets load correctly on GitHub Pages
  base: './', 
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        chunkFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        assetFileNames: `assets/[name]-[hash]-${Date.now()}.[ext]`
      }
    }
  } 
});
