import { db } from './db.js';
import crypto from 'crypto';

export default {
	async fetch(request, env) {
		const origin = request.headers.get('Origin');
		const allowedOrigins = ['https://dash.xpert0.in', 'null'];
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Credentials': 'true',
					'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : '',
				},
			});
		}

		const url = new URL(request.url);
		const path = url.pathname;
		const pathParts = path.split('/').filter(Boolean);
		function getHeaders() {
			const headers = {
				'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
				'Access-Control-Allow-Credentials': 'true',
			};
			if (allowedOrigins.includes(origin)) {
				headers['Access-Control-Allow-Origin'] = origin;
			}
			return headers;
		}

		async function register() {
			const requestBody = await request.json();
			const email = requestBody.email;
			const passhash = crypto.hash('sha512',requestBody.password);
			let check = db.prepare('SELECT EXISTS (SELECT 1 FROM users WHERE email = ?) AS chk').bind(email).get();
			if (check.chk) {
				return new Response(JSON.stringify({ error: 'Email already exists' }), {
					status: 401,
					headers: { ...getHeaders() },
				});
			}
			let uuid = crypto.randomUUID();
			const res = await fetch('http://localhost:3001/api/register', {
		      method: 'POST',
		      body: JSON.stringify({ uuid })
		    });
			db.prepare('INSERT INTO users (uuid,email,passhash,key) VALUES (?,?,?,?);').bind(uuid, email, passhash,res.key).run();
			return new Response(JSON.stringify({ message: 'Registration successful' }), {
				status: 200,
				headers: {
					...getHeaders(),
					'Set-Cookie': `uuid=${uuid}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=86400`,
				},
			});
		}

		async function login() {
			const requestBody = await request.json();
			const email = requestBody.email;
			const passhash = crypto.hash('sha512',requestBody.password);
			let check = db.prepare('SELECT EXISTS (SELECT 1 FROM users WHERE email = ?) AS chk').bind(email).get();
			if (check.chk) {
				let uuid = db.prepare('SELECT uuid FROM users WHERE email = ? AND passhash = ?').bind(email, passhash).get();
				if (!uuid) {
					return new Response(JSON.stringify({ message: 'Invalid credentials' }), {
						status: 401,
						headers: { ...getHeaders() },
					});
				}
				return new Response(JSON.stringify({ message: 'Login successful' }), {
					status: 200,
					headers: {
						...getHeaders(),
						'Set-Cookie': `uuid=${uuid.uuid}; HttpOnly; Secure; SameSite=None; Path=/; Partitioned; Max-Age=86400`,
					},
				});
			}
			return new Response(JSON.stringify({ message: 'Please Register first' }), {
				status: 401,
				headers: { ...getHeaders() },
			});
		}

		async function logout() {
			return new Response(JSON.stringify({ message: 'Logout successful' }), {
				status: 200,
				headers: {
					...getHeaders(),
					'Set-Cookie': `uuid=; HttpOnly; Secure; SameSite=None; Path=/; Partitioned; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
				},
			});
		}

		async function submitData() {
			const cookieHeader = request.headers.get('Cookie');
			if (!cookieHeader) {
				return new Response(JSON.stringify({ message: 'Not authenticated' }), {
					status: 401,
					headers: { ...getHeaders() },
				});
			}
			const cookies = Object.fromEntries(cookieHeader.split('; ').map((c) => c.split('=')));
			if (!cookies.uuid) {
				return new Response(JSON.stringify({ message: 'UUID not found' }), {
					status: 401,
					headers: { ...getHeaders() },
				});
			} else {
				const data = await request.json();
				const key = db.prepare('SELECT key FROM users WHERE uuid = ?').bind(cookies.uuid).first();
				const res = await fetch('http://localhost:3001/api/submit', {
			      method: 'POST',
			      body: JSON.stringify({
			      	"uuid":`${cookies.uuid}`,
			      	"key":`${key.key}`,
			      	data
			      })
			    });

				return new Response(JSON.stringify(res), {
					status: 200,
					headers: { ...getHeaders() },
				});
			}
		}

		if (pathParts[0] === 'v1') {
			if (pathParts[1] === 'submit') return submitData();
			if (pathParts[1] === 'register') return register();
			if (pathParts[1] === 'auth') return login();
			if (pathParts[1] === 'logout') return logout();
		}
		return new Response(JSON.stringify({ message: 'Bad Request' }), {
			status: 400,
			headers: { ...getHeaders() },
		});
	},
};
