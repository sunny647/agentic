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

// Migration helper: create stories table if not exists
export async function ensureStoriesTable() {
  const createTable = `
    CREATE TABLE IF NOT EXISTS stories (
      id SERIAL PRIMARY KEY,
      key VARCHAR(32) NOT NULL,
      summary TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;
  await queryDB(createTable);
}
