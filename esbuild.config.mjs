import esbuild from 'esbuild';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from 'node:fs';

const production = process.argv.includes('production');

/**
 * Dev サイクル用に、ビルド成果物を直接 Vault のプラグインディレクトリに
 * 書き出す。リリース時は production フラグ付きで dist/ にも書く形に変更可能。
 *
 * 配布先 Vault は手元の Akitaroh vault。複数 vault に配るなら配列にして
 * forEach する。
 */
const PLUGIN_OUT_DIR =
  '/Users/akitaroh/Desktop/Akitaroh/.obsidian/plugins/mermaid-maker';

const ensureDir = (path) => {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
};

const copyManifestAndVersions = () => {
  ensureDir(PLUGIN_OUT_DIR);
  copyFileSync('manifest.json', `${PLUGIN_OUT_DIR}/manifest.json`);
};

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron'],
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  jsx: 'automatic',
  loader: { '.tsx': 'tsx' },
  outfile: `${PLUGIN_OUT_DIR}/main.js`,
  sourcemap: production ? false : 'inline',
  minify: production,
  treeShaking: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'copy-manifest',
      setup(build) {
        build.onStart(() => copyManifestAndVersions());
      },
    },
    {
      // import された CSS は entry 名で出力されるので main.css になる。
      // Obsidian は plugin/styles.css を自動ロードする規約。
      name: 'rename-css',
      setup(build) {
        build.onEnd(() => {
          const src = `${PLUGIN_OUT_DIR}/main.css`;
          const dst = `${PLUGIN_OUT_DIR}/styles.css`;
          if (existsSync(src)) {
            try {
              renameSync(src, dst);
            } catch {}
          }
        });
      },
    },
  ],
});

if (production) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
  console.log('[mermaid-maker] esbuild watching... (output → Vault plugin dir)');
}
