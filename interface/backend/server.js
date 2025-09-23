import http from 'http';
import handler from './index.js';

const server = http.createServer(async (req, res) => {
  try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      let rawBody = '';
      for await (const chunk of req) {
        rawBody += chunk;
      }
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      const jsonBody = hasBody ? JSON.parse(rawBody || '{}') : null;
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: hasBody ? JSON.stringify(jsonBody) : null,
      });
      const response = await handler.fetch(request);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      const buffer = Buffer.from(await response.arrayBuffer());
      res.end(buffer);
//   try {
//     const url = new URL(req.url, `http://${req.headers.host}`);
//     const body = await new Promise((resolve) => {
//       let data = '';
//       req.on('data', chunk => data += chunk);
//       req.on('end', () => resolve(data));
//     });
// 
//     const request = new Request(url, {
//       method: req.method,
//       headers: req.headers,
//       body: ['GET','POST','HEAD'].includes(req.method) ? null : body
//     });
// 
//     const response = await handler.fetch(request);
// 
//     res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
//     const responseBody = await response.arrayBuffer();
//     res.end(Buffer.from(responseBody));
  } catch (err) {
  	console.log(err)
    res.writeHead(500);
    res.end('Internal Server Error');
  }
});

server.listen(5000, () => {
  console.log('Listening on http://localhost:5000');
});
