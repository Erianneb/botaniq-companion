// server.js

const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test PostgreSQL connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('PostgreSQL connection error:', err);
  } else {
    console.log('PostgreSQL connected at:', res.rows[0].now);
  }
});

/* =========================
   CREATE ACCOUNT (SIGNUP)
========================= */
app.post('/api/session/create', async (req, res) => {
  const { username, password } = req.body;
  const session_code = uuidv4().toUpperCase().slice(0, 8);

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Missing credentials' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO sessions (username, password_hash, session_code)
       VALUES ($1, $2, $3)
       RETURNING session_code, survey_completed`,
      [username, password, session_code]
    );

    res.status(201).json({
      success: true,
      session_code: result.rows[0].session_code,
      survey_completed: result.rows[0].survey_completed
    });

  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, message: 'Username already taken' });
    }
    console.error(err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

/* =========================
          LOGIN
========================= */
app.post('/api/session/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Missing credentials' });
  }

  try {
    const result = await pool.query(
      `SELECT session_code, password_hash, survey_completed
       FROM sessions
       WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];

    if (user.password_hash !== password) {
      return res.status(401).json({ success: false, message: 'Incorrect password' });
    }

    res.json({
      success: true,
      session_code: user.session_code,
      survey_completed: user.survey_completed
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

app.post('/api/survey/submit', async (req, res) => {
  const { session_code, answers } = req.body;

  if (!session_code || !answers || typeof answers !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1️⃣ Check session exists
    const sessionCheck = await client.query(
      `SELECT survey_completed FROM sessions WHERE session_code = $1`,
      [session_code]
    );

    if (sessionCheck.rows.length === 0) {
      throw new Error('Invalid session code');
    }

    if (sessionCheck.rows[0].survey_completed) {
      throw new Error('Survey already submitted');
    }

    // 2️⃣ Validate answers + compute score
    let totalScore = 0;

    for (const [question_id, value] of Object.entries(answers)) {
      const answerValue = Number(value);

      if (!Number.isInteger(answerValue) || answerValue < 0 || answerValue > 5) {
        throw new Error(`Invalid answer for ${question_id}`);
      }

      totalScore += answerValue;

      await client.query(
        `INSERT INTO survey_answers (session_code, question_id, answer_value)
         VALUES ($1, $2, $3)`,
        [session_code, question_id, answerValue]
      );
    }

    // 3️⃣ Save score
    await client.query(
      `INSERT INTO survey_scores (session_code, total_score)
       VALUES ($1, $2)`,
      [session_code, totalScore]
    );

    // 4️⃣ Mark survey as completed
    await client.query(
      `UPDATE sessions SET survey_completed = true WHERE session_code = $1`,
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
    console.error(err.message);

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

app.get('/survey.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'survey.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`BOTANIQ Server running on http://localhost:${PORT}`);
});
