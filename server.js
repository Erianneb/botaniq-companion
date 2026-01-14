// server.js

const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

/* =========================
        MIDDLEWARE
========================= */
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* =========================
     POSTGRESQL (SUPABASE)
========================= */
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Test DB connection on startup
(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected at:', res.rows[0].now);
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    process.exit(1);
  }
})();

/* =========================
   CREATE ACCOUNT (SIGNUP)
========================= */
app.post('/api/session/create', async (req, res) => {
  const { username, password } = req.body;
  const session_code = uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Missing username or password'
    });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO sessions (username, password_hash, session_code)
      VALUES ($1, $2, $3)
      RETURNING session_code, survey_completed
      `,
      [username, password, session_code]
    );

    res.status(201).json({
      success: true,
      session_code: result.rows[0].session_code,
      survey_completed: result.rows[0].survey_completed
    });

  } catch (err) {
    console.error('Signup error:', err.message);

    if (err.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Username already taken'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server database error'
    });
  }
});

/* =========================
           LOGIN
========================= */
app.post('/api/session/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: 'Missing username or password'
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT session_code, password_hash, survey_completed
      FROM sessions
      WHERE username = $1
      `,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    if (user.password_hash !== password) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password'
      });
    }

    res.json({
      success: true,
      session_code: user.session_code,
      survey_completed: user.survey_completed
    });

  } catch (err) {
    console.error('Login error:', err.message);

    res.status(500).json({
      success: false,
      message: 'Server database error'
    });
  }
});

/* =========================
      SUBMIT SURVEY
========================= */
app.post('/api/survey/submit', async (req, res) => {
  const { session_code, answers } = req.body;

  if (!session_code || !answers || typeof answers !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Invalid survey payload'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check session
    const sessionRes = await client.query(
      `SELECT survey_completed FROM sessions WHERE session_code = $1`,
      [session_code]
    );

    if (sessionRes.rows.length === 0) {
      throw new Error('Invalid session code');
    }

    if (sessionRes.rows[0].survey_completed) {
      throw new Error('Survey already submitted');
    }

    let totalScore = 0;

    for (const [question_id, value] of Object.entries(answers)) {
      const answerValue = Number(value);

      if (!Number.isInteger(answerValue) || answerValue < 0 || answerValue > 5) {
        throw new Error(`Invalid answer for ${question_id}`);
      }

      totalScore += answerValue;

      await client.query(
        `
        INSERT INTO survey_answers (session_code, question_id, answer_value)
        VALUES ($1, $2, $3)
        `,
        [session_code, question_id, answerValue]
      );
    }

    await client.query(
      `
      INSERT INTO survey_scores (session_code, total_score)
      VALUES ($1, $2)
      `,
      [session_code, totalScore]
    );

    await client.query(
      `
      UPDATE sessions
      SET survey_completed = true
      WHERE session_code = $1
      `,
      [session_code]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      total_score: totalScore,
      message: 'Survey submitted successfully'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Survey error:', err.message);

    res.status(400).json({
      success: false,
      message: err.message
    });

  } finally {
    client.release();
  }
});

/* =========================
        STATIC ROUTES
========================= */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/orientation', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'orientation.html'));
});

app.get('/survey', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'survey.html'));
});

/* =========================
        START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`🚀 BOTANIQ Server running on port ${PORT}`);
});
