// db.js
import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  user: "youruser",
  host: "localhost",
  database: "radar",
  password: "yourpassword",
  port: 5432,
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
