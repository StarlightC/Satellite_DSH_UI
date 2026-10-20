import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    name: 'satellite-ui',
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    deps: { neverBundle: [/^@deepseek-ai\//] },
    outputOptions: { entryFileNames: 'index.js' },
  },
  {
    name: 'satellite-ui/client',
    entry: { client: 'src/client.tsx' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    target: 'es2022',
    deps: {
      neverBundle: ['react', 'react/jsx-runtime'],
      alwaysBundle: (id: string) => !['react', 'react/jsx-runtime'].includes(id),
    },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "satellite-ui", factory: (require) => {',      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
