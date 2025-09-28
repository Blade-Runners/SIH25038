// import http from 'http';
// import handler from './index.js';

// const server = http.createServer(async (req, res) => {
//   try {
//       const url = new URL(req.url, `http://${req.headers.host}`);
//       let rawBody = '';
//       for await (const chunk of req) {
//         rawBody += chunk;
//       }
//       const hasBody = !['GET', 'HEAD'].includes(req.method);
//       const jsonBody = hasBody ? JSON.parse(rawBody || '{}') : null;
//       const request = new Request(url, {
//         method: req.method,
//         headers: req.headers,
//         body: hasBody ? JSON.stringify(jsonBody) : null,
//       });
//       const response = await handler.fetch(request);
//       res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
//       const buffer = Buffer.from(await response.arrayBuffer());
//       res.end(buffer);
//   } catch (err) {
//   	console.log(err)
//     res.writeHead(500);
//     res.end('Internal Server Error');
//   }
// });

// server.listen(5000, () => {
//   console.log('Listening on http://localhost:5000');
// });






import http from 'http';
import handler from './index.js';
import cors from 'cors';

// 1. Create the CORS middleware instance with your options
const corsOptions = {
  origin: 'http://localhost:3000', // Your frontend's URL
  credentials: true,
};
const corsMiddleware = cors(corsOptions);

const server = http.createServer(async (req, res) => {
  // 2. Run the CORS middleware for every request
  corsMiddleware(req, res, async (err) => {
    if (err) {
      // Handle potential errors from the CORS middleware itself
      res.writeHead(500);
      res.end('CORS Error');
      return;
    }

    // 3. The CORS middleware handles OPTIONS preflight requests automatically.
    // If the response has already been sent, we don't need to do anything else.
    if (res.headersSent) {
      return;
    }

    // 4. Your original logic now runs *after* CORS headers are handled.
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
    } catch (err) {
      console.log(err);
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });
});

server.listen(5000, () => {
  console.log('Listening on http://localhost:5000');
});