import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// 题库数据放在仓库根目录 data/（与代码分离），开发时以 /data/* 提供，构建时复制到 dist/data/，
// 并生成 Service Worker 的预缓存清单。
function bankAndSw(): Plugin {
  const dataDir = path.resolve(__dirname, 'data');
  let outDir = 'dist';
  return {
    name: 'moto-k1-bank-sw',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const p = path.join(dataDir, decodeURIComponent((req.url || '/').split('?')[0]));
        if (!p.startsWith(dataDir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return next();
        res.setHeader('Content-Type', p.endsWith('.json') ? 'application/json' : 'image/jpeg');
        fs.createReadStream(p).pipe(res);
      });
    },
    closeBundle() {
      fs.cpSync(dataDir, path.join(outDir, 'data'), { recursive: true });
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of fs.readdirSync(d)) {
          const p = path.join(d, f);
          if (fs.statSync(p).isDirectory()) walk(p);
          else files.push('./' + path.relative(outDir, p).split(path.sep).join('/'));
        }
      };
      walk(outDir);
      const list = ['./', ...files.filter(f => f !== './sw.js' && !f.endsWith('.map'))];
      const bank = JSON.parse(fs.readFileSync(path.join(dataDir, 'bank.json'), 'utf8'));
      const hash = Date.now().toString(36);
      const sw = fs.readFileSync(path.join(outDir, 'sw.js'), 'utf8')
        .replace('__PRECACHE__', JSON.stringify(list))
        .replace('__CACHE_VERSION__', `${bank.version}-${hash}`);
      fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [bankAndSw()],
  test: { environment: 'node' },
} as any);
