import dotenv from 'dotenv';
dotenv.config();

['OPENAI_API_KEY'].forEach((k) => {
  if (!process.env[k]) console.warn(`[warn] Missing env var: ${k}`);
});
