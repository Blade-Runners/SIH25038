import Database from 'better-sqlite3';
export const db = new Database('0.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uuid TEXT PRIMARY KEY UNIQUE NOT NULL,
    name TEXT,
    email TEXT,
    passhash TEXT,
    key TEXT
  );
`);
