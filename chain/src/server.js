import { createServer } from 'http';
import { parse } from 'url';
import { readFileSync } from 'fs';

export class HTTPServer {
  constructor(config, blockchain, p2pNetwork) {
    this.config = config;
    this.blockchain = blockchain;
    this.p2pNetwork = p2pNetwork;
    this.server = null;
  }

  async start() {
    this.server = createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '3600');
      
      this.handleRequest(req, res);
    });

    this.server.listen(this.config.port, '0.0.0.0', () => {
      console.log(`HTTP server started on port ${this.config.port}`);
    });
  }

  async handleRequest(req, res) {
    const { pathname, query } = parse(req.url, true);
    const method = req.method;

    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      let body = null;
      if (method === 'POST') {
        body = await this.getRequestBody(req);
      }

      if (pathname === '/api/register' && method === 'POST') {
        await this.handleRegister(req, res, body);
      } else if (pathname === '/api/submit' && method === 'POST') {
        await this.handleSubmit(req, res, body);
      } else if (pathname === '/api/data' && method === 'GET') {
        await this.handleGetData(req, res);
      } else if (pathname === '/api/pool' && method === 'GET') {
        await this.handleGetPool(req, res);
      } else if (pathname === '/api/chain' && method === 'GET') {
        await this.handleGetChain(req, res);
      } else if (pathname === '/api/credits' && method === 'POST') {
        await this.handleGetCredits(req, res, body);
      } else if (pathname === '/api/submission' && method === 'POST') {
        await this.handleGetSubmission(req, res, body);
      } else if (pathname === '/docs' && method === 'GET') {
        await this.handleDocs(req, res);
      } else {
        this.sendResponse(res, 404, { error: 'Not found' });
      }
    } catch (error) {
      console.error('Request handling error:', error);
      this.sendResponse(res, 500, { error: 'Internal server error' });
    }
  }

  async getRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }

  sendResponse(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  sendHtmlResponse(res, statusCode, html) {
    res.writeHead(statusCode, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  async handleRegister(req, res, body) {
    try {
      const { uuid } = body;
      
      if (!uuid) {
        return this.sendResponse(res, 400, { error: 'UUID is required' });
      }

      const key = this.blockchain.registerUuid(uuid);
      this.sendResponse(res, 200, { uuid, key });
    } catch (error) {
      this.sendResponse(res, 400, { error: error.message });
    }
  }

  async handleSubmit(req, res, body) {
    try {
      const { uuid, key, data } = body;
      
      if (!uuid || !key || !data) {
        return this.sendResponse(res, 400, { 
          error: 'UUID, key, and data are required' 
        });
      }

      const result = this.blockchain.submitData(uuid, key, data, this.p2pNetwork.peerId);
      
      if (!result.preValidated) {
        this.p2pNetwork.broadcastSubmission(result.submissionId, uuid, data);
      }
      
      this.sendResponse(res, 200, result);
    } catch (error) {
      this.sendResponse(res, 400, { error: error.message });
    }
  }

  async handleGetData(req, res) {
    try {
      const data = this.blockchain.getFinalizedData();
      this.sendResponse(res, 200, { data, count: data.length });
    } catch (error) {
      this.sendResponse(res, 500, { error: error.message });
    }
  }

  async handleGetPool(req, res) {
    try {
      const pool = this.blockchain.getValidationPool();
      this.sendResponse(res, 200, { pool, count: pool.length });
    } catch (error) {
      this.sendResponse(res, 500, { error: error.message });
    }
  }

  async handleGetChain(req, res) {
    try {
      const stats = this.blockchain.getChainStats();
      const peers = this.p2pNetwork.getConnectedPeers();
      
      const chainInfo = {
        stats,
        peers: {
          connected: this.p2pNetwork.getConnectedPeerCount(),
          total: this.p2pNetwork.getTotalPeerCount(),
          details: peers
        },
        config: {
          port: this.config.port,
          p2pPort: this.config.p2p,
          saveInterval: this.config.saveInterval,
          validationTimeout: this.config.val_timeout,
          similarityThreshold: this.config.sim_thres,
          uuidValidationThreshold: this.config.uuid_val_thres,
          peerValidationThreshold: this.config.peer_val_thres
        }
      };
      
      this.sendResponse(res, 200, chainInfo);
    } catch (error) {
      this.sendResponse(res, 500, { error: error.message });
    }
  }

  async handleGetCredits(req, res, body) {
    try {
      const { uuid } = body;
      
      if (!uuid) {
        return this.sendResponse(res, 400, { error: 'UUID is required' });
      }

      const credits = this.blockchain.getCredits(uuid);
      this.sendResponse(res, 200, { uuid, ...credits });
    } catch (error) {
      this.sendResponse(res, 500, { error: error.message });
    }
  }

  async handleGetSubmission(req, res, body) {
    try {
      const { submissionId } = body;
      
      if (!submissionId) {
        return this.sendResponse(res, 400, { error: 'Submission ID is required' });
      }

      const submission = this.blockchain.getSubmission(submissionId);
      
      if (!submission) {
        return this.sendResponse(res, 404, { error: 'Submission not found' });
      }

      this.sendResponse(res, 200, submission);
    } catch (error) {
      this.sendResponse(res, 500, { error: error.message });
    }
  }

  async handleDocs(req, res) {
    try {
      const html = this.generateDocsPage();
      this.sendHtmlResponse(res, 200, html);
    } catch (error) {
      this.sendResponse(res, 500, { error: error.message });
    }
  }

  generateDocsPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blockchain Registry API Documentation</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .endpoint { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        .method { display: inline-block; padding: 5px 10px; color: white; border-radius: 3px; font-weight: bold; }
        .post { background-color: #28a745; }
        .get { background-color: #007bff; }
        .code { background-color: #f8f9fa; padding: 10px; border-radius: 3px; overflow-x: auto; }
        .curl-examples { margin-top: 15px; }
        .curl-tab { display: inline-block; padding: 8px 15px; margin: 5px; background: #6c757d; color: white; border-radius: 3px; cursor: pointer; }
        .curl-tab.active { background: #007bff; }
        .curl-content { display: none; margin-top: 10px; }
        .curl-content.active { display: block; }
        pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; }
        h1 { color: #333; }
        h2 { color: #666; margin-top: 30px; }
        .copy-btn { float: right; padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; }
        .copy-btn:hover { background: #1e7e34; }
    </style>
    <script>
        function showCurl(platform, elementId) {
            // Hide all curl content for this endpoint
            const contents = document.querySelectorAll('#' + elementId + ' .curl-content');
            contents.forEach(content => content.classList.remove('active'));
            
            // Remove active class from all tabs for this endpoint
            const tabs = document.querySelectorAll('#' + elementId + ' .curl-tab');
            tabs.forEach(tab => tab.classList.remove('active'));
            
            // Show selected content and activate tab
            document.querySelector('#' + elementId + ' .curl-' + platform).classList.add('active');
            document.querySelector('#' + elementId + ' .tab-' + platform).classList.add('active');
        }
        
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                // Could add a temporary "Copied!" message here
            });
        }
        
        window.onload = function() {
            // Initialize first tab as active for each endpoint
            const endpoints = document.querySelectorAll('.endpoint');
            endpoints.forEach(endpoint => {
                const firstTab = endpoint.querySelector('.curl-tab');
                const firstContent = endpoint.querySelector('.curl-content');
                if (firstTab && firstContent) {
                    firstTab.classList.add('active');
                    firstContent.classList.add('active');
                }
            });
        }
    </script>
</head>
<body>
    <h1>Blockchain Registry API Documentation</h1>
    <p>This is a blockchain-powered registry with peer-to-peer validation and tokenized credits.</p>
    
    <h2>Configuration</h2>
    <div class="code">
        <pre>Server Port: ${this.config.port}
P2P Port: ${this.config.p2p}
Validation Timeout: ${this.config.val_timeout} seconds
Similarity Threshold: ${this.config.sim_thres}
UUID Validation Threshold: ${this.config.uuid_val_thres}
Peer Validation Threshold: ${this.config.peer_val_thres}</pre>
    </div>

    <h2>API Endpoints</h2>

    <div class="endpoint" id="register">
        <h3><span class="method post">POST</span> /api/register</h3>
        <p>Register a new UUID and get an access key.</p>
        <div class="code">
            <pre>Request Body:
{
  "uuid": "your-uuid-here"
}

Response:
{
  "uuid": "your-uuid-here",
  "key": "generated-access-key"
}</pre>
        </div>
        
        <div class="curl-examples">
            <span class="curl-tab tab-linux" onclick="showCurl('linux', 'register')">Linux/Mac</span>
            <span class="curl-tab tab-windows" onclick="showCurl('windows', 'register')">Windows</span>
            
            <div class="curl-content curl-linux">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X POST http://localhost:${this.config.port}/api/register \\\\\\n  -H "Content-Type: application/json" \\\\\\n  -d '{"uuid": "12345678-1234-1234-1234-123456789abc"}'\`)">Copy</button>
                <pre>curl -X POST http://localhost:${this.config.port}/api/register \\
  -H "Content-Type: application/json" \\
  -d '{"uuid": "12345678-1234-1234-1234-123456789abc"}'</pre>
            </div>
            
            <div class="curl-content curl-windows">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X POST http://localhost:${this.config.port}/api/register -H "Content-Type: application/json" -d "{\\"uuid\\": \\"12345678-1234-1234-1234-123456789abc\\"}"\`)">Copy</button>
                <pre>curl -X POST http://localhost:${this.config.port}/api/register -H "Content-Type: application/json" -d "{\"uuid\": \"12345678-1234-1234-1234-123456789abc\"}"</pre>
            </div>
        </div>
    </div>

    <div class="endpoint" id="submit">
        <h3><span class="method post">POST</span> /api/submit</h3>
        <p>Submit data for validation on the blockchain.</p>
        <div class="code">
            <pre>Request Body:
{
  "uuid": "your-uuid-here",
  "key": "your-access-key",
  "data": {
    "location": { "latitude": 12.345, "longitude": 67.890 },
    "area": 1000,
    "shape": "rectangle",
    "type": "restoration",
    "speciesData": ["Mangrove", "Seagrass"]
  }
}

Response:
{
  "submissionId": "generated-submission-id",
  "status": "waiting" | "validated",
  "preValidated": true (if privileged UUID)
}</pre>
        </div>
        
        <div class="curl-examples">
            <span class="curl-tab tab-linux" onclick="showCurl('linux', 'submit')">Linux/Mac</span>
            <span class="curl-tab tab-windows" onclick="showCurl('windows', 'submit')">Windows</span>
            
            <div class="curl-content curl-linux">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X POST http://localhost:${this.config.port}/api/submit \\\\\\n  -H "Content-Type: application/json" \\\\\\n  -d '{\\n    "uuid": "12345678-1234-1234-1234-123456789abc",\\n    "key": "your-access-key",\\n    "data": {\\n      "location": { "latitude": 12.345, "longitude": 67.890 },\\n      "area": 1000,\\n      "shape": "rectangle",\\n      "type": "restoration",\\n      "speciesData": ["Mangrove", "Seagrass"]\\n    }\\n  }'\`)">Copy</button>
                <pre>curl -X POST http://localhost:${this.config.port}/api/submit \\
  -H "Content-Type: application/json" \\
  -d '{
    "uuid": "12345678-1234-1234-1234-123456789abc",
    "key": "your-access-key",
    "data": {
      "location": { "latitude": 12.345, "longitude": 67.890 },
      "area": 1000,
      "shape": "rectangle",
      "type": "restoration",
      "speciesData": ["Mangrove", "Seagrass"]
    }
  }'</pre>
            </div>
            
            <div class="curl-content curl-windows">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X POST http://localhost:${this.config.port}/api/submit -H "Content-Type: application/json" -d "{\\"uuid\\": \\"12345678-1234-1234-1234-123456789abc\\", \\"key\\": \\"your-access-key\\", \\"data\\": {\\"location\\": {\\"latitude\\": 12.345, \\"longitude\\": 67.890}, \\"area\\": 1000, \\"shape\\": \\"rectangle\\", \\"type\\": \\"restoration\\", \\"speciesData\\": [\\"Mangrove\\", \\"Seagrass\\"]}}"\`)">Copy</button>
                <pre>curl -X POST http://localhost:${this.config.port}/api/submit -H "Content-Type: application/json" -d "{\"uuid\": \"12345678-1234-1234-1234-123456789abc\", \"key\": \"your-access-key\", \"data\": {\"location\": {\"latitude\": 12.345, \"longitude\": 67.890}, \"area\": 1000, \"shape\": \"rectangle\", \"type\": \"restoration\", \"speciesData\": [\"Mangrove\", \"Seagrass\"]}}"</pre>
            </div>
        </div>
    </div>

    <div class="endpoint" id="data">
        <h3><span class="method get">GET</span> /api/data</h3>
        <p>Get all finalized data submissions.</p>
        <div class="code">
            <pre>Response:
{
  "data": [
    {
      "submissionId": "submission-id",
      "uuid": "submitter-uuid",
      "data": { ... },
      "credits": 1,
      "timestamp": 1234567890,
      "blockIndex": 1
    }
  ],
  "count": 1
}</pre>
        </div>
        
        <div class="curl-examples">
            <span class="curl-tab tab-linux" onclick="showCurl('linux', 'data')">Linux/Mac</span>
            <span class="curl-tab tab-windows" onclick="showCurl('windows', 'data')">Windows</span>
            
            <div class="curl-content curl-linux">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X GET http://localhost:${this.config.port}/api/data\`)">Copy</button>
                <pre>curl -X GET http://localhost:${this.config.port}/api/data</pre>
            </div>
            
            <div class="curl-content curl-windows">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X GET http://localhost:${this.config.port}/api/data\`)">Copy</button>
                <pre>curl -X GET http://localhost:${this.config.port}/api/data</pre>
            </div>
        </div>
    </div>

    <div class="endpoint" id="pool">
        <h3><span class="method get">GET</span> /api/pool</h3>
        <p>Get all submissions currently in the validation pool.</p>
        <div class="code">
            <pre>Response:
{
  "pool": [
    {
      "submissionId": "submission-id",
      "uuid": "submitter-uuid",
      "data": { ... },
      "status": "waiting" | "validated" | "rejected",
      "timestamp": 1234567890,
      "validators": 2,
      "peers": 1
    }
  ],
  "count": 1
}</pre>
        </div>
        
        <div class="curl-examples">
            <span class="curl-tab tab-linux" onclick="showCurl('linux', 'pool')">Linux/Mac</span>
            <span class="curl-tab tab-windows" onclick="showCurl('windows', 'pool')">Windows</span>
            
            <div class="curl-content curl-linux">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X GET http://localhost:${this.config.port}/api/pool\`)">Copy</button>
                <pre>curl -X GET http://localhost:${this.config.port}/api/pool</pre>
            </div>
            
            <div class="curl-content curl-windows">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X GET http://localhost:${this.config.port}/api/pool\`)">Copy</button>
                <pre>curl -X GET http://localhost:${this.config.port}/api/pool</pre>
            </div>
        </div>
    </div>

    <div class="endpoint" id="chain">
        <h3><span class="method get">GET</span> /api/chain</h3>
        <p>Get detailed overview of the blockchain state.</p>
        <div class="code">
            <pre>Response:
{
  "stats": {
    "blockCount": 10,
    "totalTransactions": 5,
    "registeredUuids": 3,
    "validationPoolSize": 1,
    "totalCreditsIssued": 5
  },
  "peers": {
    "connected": 2,
    "total": 3,
    "details": [...]
  },
  "config": { ... }
}</pre>
        </div>
        
        <div class="curl-examples">
            <span class="curl-tab tab-linux" onclick="showCurl('linux', 'chain')">Linux/Mac</span>
            <span class="curl-tab tab-windows" onclick="showCurl('windows', 'chain')">Windows</span>
            
            <div class="curl-content curl-linux">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X GET http://localhost:${this.config.port}/api/chain\`)">Copy</button>
                <pre>curl -X GET http://localhost:${this.config.port}/api/chain</pre>
            </div>
            
            <div class="curl-content curl-windows">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X GET http://localhost:${this.config.port}/api/chain\`)">Copy</button>
                <pre>curl -X GET http://localhost:${this.config.port}/api/chain</pre>
            </div>
        </div>
    </div>

    <div class="endpoint" id="credits">
        <h3><span class="method post">POST</span> /api/credits</h3>
        <p>Get credit balance and history for a UUID.</p>
        <div class="code">
            <pre>Request Body:
{
  "uuid": "your-uuid-here"
}

Response:
{
  "uuid": "your-uuid-here",
  "balance": 5,
  "history": [
    {
      "amount": 1,
      "timestamp": 1234567890,
      "type": "reward"
    }
  ]
}</pre>
        </div>
        
        <div class="curl-examples">
            <span class="curl-tab tab-linux" onclick="showCurl('linux', 'credits')">Linux/Mac</span>
            <span class="curl-tab tab-windows" onclick="showCurl('windows', 'credits')">Windows</span>
            
            <div class="curl-content curl-linux">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X POST http://localhost:${this.config.port}/api/credits \\\\\\n  -H "Content-Type: application/json" \\\\\\n  -d '{"uuid": "12345678-1234-1234-1234-123456789abc"}'\`)">Copy</button>
                <pre>curl -X POST http://localhost:${this.config.port}/api/credits \\
  -H "Content-Type: application/json" \\
  -d '{"uuid": "12345678-1234-1234-1234-123456789abc"}'</pre>
            </div>
            
            <div class="curl-content curl-windows">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X POST http://localhost:${this.config.port}/api/credits -H "Content-Type: application/json" -d "{\\"uuid\\": \\"12345678-1234-1234-1234-123456789abc\\"}"\`)">Copy</button>
                <pre>curl -X POST http://localhost:${this.config.port}/api/credits -H "Content-Type: application/json" -d "{\"uuid\": \"12345678-1234-1234-1234-123456789abc\"}"</pre>
            </div>
        </div>
    </div>

    <div class="endpoint" id="submission">
        <h3><span class="method post">POST</span> /api/submission</h3>
        <p>Get details about a specific submission.</p>
        <div class="code">
            <pre>Request Body:
{
  "submissionId": "submission-id-here"
}

Response:
{
  "submissionId": "submission-id",
  "uuid": "submitter-uuid",
  "data": { ... },
  "status": "waiting" | "validated" | "rejected",
  "timestamp": 1234567890,
  "credits": 1 (if validated),
  "blockIndex": 1 (if validated),
  "inValidationPool": false
}</pre>
        </div>
        
        <div class="curl-examples">
            <span class="curl-tab tab-linux" onclick="showCurl('linux', 'submission')">Linux/Mac</span>
            <span class="curl-tab tab-windows" onclick="showCurl('windows', 'submission')">Windows</span>
            
            <div class="curl-content curl-linux">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X POST http://localhost:${this.config.port}/api/submission \\\\\\n  -H "Content-Type: application/json" \\\\\\n  -d '{"submissionId": "sub_abc123xyz"}'\`)">Copy</button>
                <pre>curl -X POST http://localhost:${this.config.port}/api/submission \\
  -H "Content-Type: application/json" \\
  -d '{"submissionId": "sub_abc123xyz"}'</pre>
            </div>
            
            <div class="curl-content curl-windows">
                <button class="copy-btn" onclick="copyToClipboard(\`curl -X POST http://localhost:${this.config.port}/api/submission -H "Content-Type: application/json" -d "{\\"submissionId\\": \\"sub_abc123xyz\\"}"\`)">Copy</button>
                <pre>curl -X POST http://localhost:${this.config.port}/api/submission -H "Content-Type: application/json" -d "{\"submissionId\": \"sub_abc123xyz\"}"</pre>
            </div>
        </div>
    </div>

    <h2>Data Format</h2>
    <p>The expected data format for submissions:</p>
    <div class="code">
        <pre>{
  "location": { 
    "latitude": 12.345, 
    "longitude": 67.890 
  },
  "area": 1000,
  "shape": "rectangle",
  "type": "restoration",
  "speciesData": [
    "Mangrove",
    "Seagrass"
  ]
}</pre>
    </div>

    <h2>Validation Process</h2>
    <p>1. Data is submitted via /api/submit</p>
    <p>2. If not from privileged UUID, data goes to validation pool</p>
    <p>3. Other peers validate by submitting similar data</p>
    <p>4. If thresholds are met within timeout, data is validated and added to blockchain</p>
    <p>5. Credits are awarded to the original submitter (3 credits) and validators (0.33 credits each)</p>

    <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd;">
        <p>Blockchain Registry v1.0.0 - Built with ESM JS</p>
        <p>Peer ID: ${this.p2pNetwork.peerId}</p>
    </footer>
</body>
</html>`;
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}
