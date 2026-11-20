import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.wasm':'application/wasm', '.apk':'application/vnd.android.package-archive', '.mp4':'video/mp4', '.webm':'video/webm', '.map':'application/json' };
const contained = (root, target) => target === root || target.startsWith(root + path.sep);

// Local QA server only. It serves the exported bytes; no Next dev compilation,
// production API proxy, authentication emulation, or paid-provider fallback.
export async function createStaticExportServer(root) {
  const canonicalRoot = await realpath(root);
  if (!(await stat(canonicalRoot)).isDirectory()) throw new Error('Export root must be a directory');
  const server = http.createServer(async (req, res) => {
    const reply = (status, message, type='text/plain; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : message);
    };
    try {
      if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD');return reply(405,'Read-only static QA server'); }
      const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
      const segments = pathname.split('/');
      if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || segments.some(s => s === '..' || s.startsWith('.'))) return reply(400,'Invalid path');
      if (pathname === '/__propig_static_health') return reply(200,JSON.stringify({kind:'propig-static-export',apiProxy:false}), 'application/json');
      if (pathname === '/api' || pathname.startsWith('/api/')) return reply(503,JSON.stringify({error:'Static QA does not provide a backend API'}),'application/json');
      const relative = pathname.replace(/^\/+|\/+$/g,'');
      const direct = path.resolve(canonicalRoot,relative);
      if (!contained(canonicalRoot,direct)) return reply(400,'Invalid path');
      // Prefer a real file, then Firebase cleanUrls (.html), then index.html.
      for (const candidate of [direct, direct+'.html', path.join(direct,'index.html')]) {
        let resolved, info;
        try { resolved=await realpath(candidate);if(!contained(canonicalRoot,resolved))return reply(403,'Forbidden');info=await stat(resolved); }
        catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))continue;throw error;}
        if (!info.isFile()) continue;
        res.writeHead(200,{'Content-Type':types[path.extname(resolved).toLowerCase()] || 'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        if(req.method==='HEAD'){res.end();return;}
        const stream=createReadStream(resolved);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
      }
      return reply(404,'Not found');
    } catch(error) {
      if(error instanceof URIError)return reply(400,'Invalid URL encoding');
      if(!res.headersSent)return reply(500,'Static QA read failed');
      res.destroy();
    }
  });
  return server;
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const root=path.resolve(process.env.STATIC_EXPORT_ROOT || '.next-static-export');
  const port=Number(process.env.PORT || 3002);
  if(!Number.isInteger(port)||port<1||port>65535||port===3000)throw new Error('Choose an available QA port; CY port 3000 is reserved');
  const server=await createStaticExportServer(root);
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`ProPig static export ready at http://127.0.0.1:${port}`));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close();server.closeAllConnections();});
}
