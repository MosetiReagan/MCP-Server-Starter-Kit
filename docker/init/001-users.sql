CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

INSERT INTO users (id, name, email) VALUES
  ('1', 'Ada Lovelace', 'ada@example.com'),
  ('2', 'Grace Hopper', 'grace@example.com')
ON CONFLICT DO NOTHING;
