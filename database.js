import 'dotenv/config';
import mysql from 'mysql2/promise';

let pool;

// The pool is created on first use, so the bot can run without a database if the jobs feature is not used
export function getDatabase() {
  pool ??= mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  return pool;
}
