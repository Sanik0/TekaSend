import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const files = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/sample-document.svg', ['sample-document.svg', 'image/svg+xml']]]);
http.createServer(async (request, response) => {
  const file = files.get(request.url || '');
  if (!file) { response.writeHead(404); response.end('Not found'); return; }
  try { const data = await readFile(join('demo', file[0])); response.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' }); response.end(data); }
  catch { response.writeHead(500); response.end('Could not load demo'); }
}).listen(8000, '127.0.0.1', () => console.log('Demo ready: http://127.0.0.1:8000/'));
