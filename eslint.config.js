export default [
  {
    files: ['src/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', sessionStorage: 'readonly',
        console: 'readonly', alert: 'readonly', confirm: 'readonly',
        prompt: 'readonly', fetch: 'readonly', URL: 'readonly',
        URLSearchParams: 'readonly', Blob: 'readonly', File: 'readonly',
        FileReader: 'readonly', FormData: 'readonly', Headers: 'readonly',
        Request: 'readonly', Response: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        HTMLElement: 'readonly', Event: 'readonly', CustomEvent: 'readonly',
        MutationObserver: 'readonly', ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        indexedDB: 'readonly', IDBKeyRange: 'readonly',
        showDirectoryPicker: 'readonly', showOpenFilePicker: 'readonly',
        showSaveFilePicker: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        Image: 'readonly', TextEncoder: 'readonly', event: 'readonly',
        location: 'readonly',
        // CDN globals loaded at runtime
        jspdf: 'readonly', html2canvas: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
];
