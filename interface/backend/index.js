import { db } from './db.js';
import crypto from 'crypto';

export default {
	async fetch(request) {
		const origin = request.headers.get('Origin');
		const allowedOrigins = ['null','http://localhost'];
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
					'Access-Control-Allow-Headers': 'Content-Type',
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
		    const key=await res.json();
			db.prepare('INSERT INTO users (uuid,email,passhash,key) VALUES (?,?,?,?);').bind(uuid, email, passhash,key.key).run();
			return new Response(JSON.stringify({message: "Registration Successful"}), {
				status: 200,
				headers: {
					...getHeaders(),
					'Set-Cookie': `uuid=${uuid}; Path=/; httpOnly; SameSite=none; secure; Partitioned; Max-Age=86400`,
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
				if(uuid.uuid==='uuid')
				return new Response(JSON.stringify({ message: 'Admin login' }), {
					status: 200,
					headers: {
						...getHeaders(),
						'Set-Cookie': `uuid=${uuid.uuid}; Path=/; httpOnly; SameSite=none; secure; Partitioned; Max-Age=86400`,
					},
				});
				return new Response(JSON.stringify({ message: 'Login success' }), {
					status: 200,
					headers: {
						...getHeaders(),
						'Set-Cookie': `uuid=${uuid.uuid}; Path=/; httpOnly; SameSite=none; secure; Partitioned; Max-Age=86400`,
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
					'Set-Cookie': `uuid=; HttpOnly; Path=/; SameSite=none; secure; Partitioned; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
				},
			});
		}

		async function submitData() {
			const cookieHeader = request.headers.get('Cookie');
			if (!cookieHeader) {
				console.log("no cookie");
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
				const key = db.prepare('SELECT key FROM users WHERE uuid = ?').bind(cookies.uuid).get();
				const res = await fetch('http://localhost:3001/api/submit', {
			      method: 'POST',
			      body: JSON.stringify({
			      	uuid:`${cookies.uuid}`,
			      	key:`${key.key}`,
			      	data
			      })
			    });
			    const subres=await res.json();

				return new Response(JSON.stringify(subres), {
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
