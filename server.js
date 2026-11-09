require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Dates are returned as plain YYYY-MM-DD strings to avoid timezone shifts.
const COLUMNS = `id, title, amount::float8 AS amount, type, category,
                 to_char(date, 'YYYY-MM-DD') AS date`;

function validate(body) {
  const errors = {};
  const title = String(body.title ?? '').trim();
  const category = String(body.category ?? '').trim();
  const type = String(body.type ?? '');
  const date = String(body.date ?? '');
  const amount = Number(body.amount);

  if (!title) errors.title = 'Enter a title.';
  else if (title.length > 100) errors.title = 'Title must be 100 characters or fewer.';

  if (body.amount === '' || body.amount == null || !Number.isFinite(amount)) {
    errors.amount = 'Enter a valid amount.';
  } else if (amount <= 0) {
    errors.amount = 'Amount must be greater than 0.';
  } else if (amount >= 1e10) {
    errors.amount = 'Amount is too large.';
  }

  if (!['income', 'expense'].includes(type)) errors.type = 'Choose income or expense.';

  if (!category) errors.category = 'Choose a category.';
  else if (category.length > 50) errors.category = 'Category is too long.';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    errors.date = 'Choose a valid date.';
  }

  return {
    errors,
    value: { title, amount: Math.round(amount * 100) / 100, type, category, date },
  };
}

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

app.get('/api/transactions', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM transactions ORDER BY date DESC, id DESC`
  );
  res.json(rows);
}));

app.post('/api/transactions', wrap(async (req, res) => {
  const { errors, value } = validate(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  const { rows } = await pool.query(
    `INSERT INTO transactions (title, amount, type, category, date)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [value.title, value.amount, value.type, value.category, value.date]
  );
  res.status(201).json(rows[0]);
}));

app.put('/api/transactions/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id.' });
  const { errors, value } = validate(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ errors });
  const { rows } = await pool.query(
    `UPDATE transactions
        SET title = $1, amount = $2, type = $3, category = $4, date = $5
      WHERE id = $6 RETURNING ${COLUMNS}`,
    [value.title, value.amount, value.type, value.category, value.date, id]
  );
  if (!rows.length) return res.status(404).json({ message: 'Transaction not found.' });
  res.json(rows[0]);
}));

app.delete('/api/transactions/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid id.' });
  const { rowCount } = await pool.query('DELETE FROM transactions WHERE id = $1', [id]);
  if (!rowCount) return res.status(404).json({ message: 'Transaction not found.' });
  res.status(204).end();
}));

app.use('/api', (req, res) => res.status(404).json({ message: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

(async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    await pool.query(schema); // creates the table on first run
    app.listen(PORT, () => console.log(`Expense tracker running at http://localhost:${PORT}`));
  } catch (err) {
    console.error('Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  }
})();
