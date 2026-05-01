const esbuild = require('esbuild');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../grindsync/.env');
let definedEnv = {};

if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const key in envConfig) {
    definedEnv[`process.env.${key}`] = JSON.stringify(envConfig[key]);
  }
}

// Add app URL if not provided
if (!definedEnv['process.env.VITE_APP_URL']) {
  definedEnv['process.env.VITE_APP_URL'] = JSON.stringify('https://grind-sync-seven.vercel.app');
}

const options = {
  // content-ui.js and challenge-modal.js removed — floating widget deleted
  entryPoints: ['src/background.js', 'src/content.js', 'src/popup.js', 'src/auth.js'],
  bundle: true,
  outdir: 'dist',
  define: definedEnv,
  minify: process.argv.includes('--minify'),
  sourcemap: !process.argv.includes('--minify'),
};

if (process.argv.includes('--watch')) {
  esbuild.context(options).then(ctx => {
    ctx.watch();
    console.log('Watching for changes...');
  });
} else {
  esbuild.build(options)
    .then(() => {
      console.log('Build complete.');
    })
    .catch(() => process.exit(1));
}
