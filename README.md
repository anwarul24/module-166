# Pocket Ledger – Personal Expense Tracker

A responsive expense tracker where you add income and expenses, see your balance, and review your history. Data is stored in a **PostgreSQL** database through a small **Node.js + Express** API. The browser also keeps a copy in **LocalStorage**, so the last saved list still shows if the server is unreachable.

## Features

- Dashboard with total income, total expenses and current balance (updates on every add, edit or delete)
- Add-transaction form: title, amount, type (income / expense), category, date
- Transaction history with title, amount, category, type and date
- Delete with a confirmation dialog
- Filter by All / Income / Expenses
- Data saved in PostgreSQL (and cached in LocalStorage)
- Responsive layout for desktop, tablet and mobile (table turns into cards on phones)
- Validation on the client **and** the server: no empty fields, no invalid amounts
- Empty-state message, success and error messages
- Bonus: edit transactions, search by title, monthly expense summary

## Tech stack

| Layer    | Technology                           |
|----------|--------------------------------------|
| Frontend | HTML, CSS, vanilla JavaScript        |
| Backend  | Node.js, Express                     |
| Database | PostgreSQL (`pg` driver)             |

## Project structure

```
expense-tracker/
├── db/schema.sql        # table definition (runs automatically on start)
├── public/              # frontend
│   ├── index.html
│   ├── style.css
│   └── app.js
├── server.js            # Express API + static file server
├── package.json
├── .env.example
└── README.md
```

## How to run

**Requirements:** Node.js 18+ and PostgreSQL 13+.

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Create the database**
   ```bash
   psql -U postgres -c "CREATE DATABASE expense_tracker;"
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env      # on Windows: copy .env.example .env
   ```
   Edit `.env` and set your PostgreSQL password in `DATABASE_URL`.

4. **Start the app**
   ```bash
   npm start
   ```
   The `transactions` table is created automatically on first start.

5. Open **http://localhost:3000**

(Optional) create the table manually: `psql -U postgres -d expense_tracker -f db/schema.sql`

## API

| Method | Endpoint                 | Description              |
|--------|--------------------------|--------------------------|
| GET    | `/api/transactions`      | List all transactions    |
| POST   | `/api/transactions`      | Create a transaction     |
| PUT    | `/api/transactions/:id`  | Update a transaction     |
| DELETE | `/api/transactions/:id`  | Delete a transaction     |

Example body for POST / PUT:

```json
{ "title": "Lunch", "amount": 12.5, "type": "expense", "category": "Food", "date": "2026-11-09" }
```

## Hosted database

For Neon, Supabase, Render, etc., paste their connection string into `DATABASE_URL` and set `PGSSL=true`.

## Notes

- Change the currency by editing `CURRENCY` at the top of `public/app.js`.
- Amounts are stored as `NUMERIC(12,2)` to avoid floating-point rounding errors.
