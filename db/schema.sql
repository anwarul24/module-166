CREATE TABLE IF NOT EXISTS transactions (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(100) NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  type        VARCHAR(7)  NOT NULL CHECK (type IN ('income', 'expense')),
  category    VARCHAR(50) NOT NULL,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date DESC);
