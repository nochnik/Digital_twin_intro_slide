// Локальный сервер показа. Запускается через start.bat, отдельно ставить ничего не нужно.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb':  'model/gltf-binary',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.mp4':  'video/mp4',
  '.svg':  'image/svg+xml',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, rel);

  if (!path.normalize(file).startsWith(ROOT)) {   // не выпускаем за пределы папки
    res.writeHead(403); res.end('forbidden'); return;
  }
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }

    // Отдаём куски по запросу. Без этого браузер не умеет перематывать видео:
    // ролики подводки листаются вручную, и перемотка к последнему кадру такта
    // без Range просто сбрасывала ролик в начало.
    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (m) {
        let start = m[1] === '' ? null : Number(m[1]);
        let end   = m[2] === '' ? null : Number(m[2]);
        if (start === null) {                    // bytes=-N — хвост файла
          start = Math.max(0, st.size - (end || 0));
          end = st.size - 1;
        } else if (end === null || end >= st.size) {
          end = st.size - 1;
        }
        if (start > end || start >= st.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
          res.end(); return;
        }
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${st.size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('Показ запущен: http://localhost:' + PORT + '/');
  console.log('Не закрывайте это окно во время показа. Остановить — Ctrl+C или просто закрыть окно.');
});
