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

// Migration: create story_images table if not exists
export async function ensureImageTable() {
  await queryDB(`
    CREATE TABLE IF NOT EXISTS story_images (
      id SERIAL PRIMARY KEY,
      issue_key VARCHAR(64) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      originalname VARCHAR(255),
      mimetype VARCHAR(64),
      size INTEGER,
      path VARCHAR(512),
      uploaded_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
// Call on startup
ensureImageTable();
