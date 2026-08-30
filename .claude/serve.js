// Static file server for verifying the overlay locally. Built-ins only, no
// packages, matching the project's no-dependency rule.
//
// Lives in .claude/ ON PURPOSE. Earlier copies of this sat in a session's
// scratchpad, and launch.json kept pointing at scratchpads that had gone away.
// This path belongs to the project, so it survives.
//
//   node .claude/serve.js <root> <port>
//
// file:// does not work for this project: it renders as a static snapshot with
// no JS and reports innerWidth === 0, which trips the MIN_WIDTH guard so the
// overlay never mounts. It has to be HTTP.

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 8126);

// image/svg+xml is the one that matters: served as octet-stream, an SVG in an
// <img> tag renders as nothing at all, which is how the medallion goes blank.
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.md': 'text/markdown'
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.resolve(path.join(root, url === '/' ? 'index.html' : url));

  // Keep traversal inside the served root.
  if (file !== root && !file.startsWith(root + path.sep)) {
    res.writeHead(403);
    return res.end('forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      // Tuning means reloading constantly; a cached stylesheet wastes a round.
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(port, () => console.log('serving ' + root + ' on ' + port));
