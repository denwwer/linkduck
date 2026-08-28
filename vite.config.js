import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';

// Build phases to inline shared imports
export default defineConfig(({ mode }) => {
  switch (mode) {
    case 'content':
      return content();
    case 'options':
      return options();
    default:
      return popup();
  }
});

const shared = {
  root: 'src',
  base: './',
  publicDir: false,
};

function content() {
  return {
    ...shared,
    build: {
      outDir: '../dist',
      emptyOutDir: true, // clean dir at start
      rollupOptions: {
        input: resolve(__dirname, 'src/content/content.js'),
        output: {
          entryFileNames: 'content.js',
          inlineDynamicImports: true,
        },
      },
    },
  };
}

// The options page is HTML, not a bare script: Vite has to read the page to
// emit it and rewrite its asset links. Pointing this at `options.js` would
// bundle the script and drop the page.
function options() {
  return {
    ...shared,
    plugins: [tailwindcss()],
    build: {
      outDir: '../dist',
      emptyOutDir: false,
      rollupOptions: {
        input: resolve(__dirname, 'src/options.html'),
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
    },
  };
}

function popup() {
  return {
    ...shared,
    plugins: [tailwindcss(), copyStatic()],
    build: {
      outDir: '../dist',
      emptyOutDir: false,
      rollupOptions: {
        input: {
          // background: resolve(__dirname, 'src/background.ts'),
          popup: resolve(__dirname, 'src/popup.html'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
        },
      },
    },
  };
}

function copyStatic() {
  return {
    name: 'copy-static',
    apply: 'build',
    async generateBundle() {
      const { spawnSync } = await import('node:child_process');

      spawnSync(
        'rsync',
        [
          '-av',
          '--exclude=*.js',
          '--exclude=*.css',
          '--exclude=*.html',
          '--exclude=content',
          '--exclude=lib',
          'src/',
          'dist/',
        ],
        { stdio: 'inherit' },
      );
    },
  };
}
