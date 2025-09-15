// db.js
import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  user: process.env.PGUSER || "youruser",
  host: process.env.PGHOST || "localhost",
  database: process.env.PGDATABASE || "radar",
  password: process.env.PGPASSWORD || "yourpassword",
  port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
});

// Helper query function
export async function queryDB(query, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(query, params);
    return res.rows;
  } finally {
    client.release();
  }
}
