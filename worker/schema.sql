-- Base Nokk (Cloudflare D1). Chaque élément d'une équipe (secteur, porte, passage…) est une ligne.
CREATE TABLE IF NOT EXISTS accounts (
  uid TEXT PRIMARY KEY,
  email TEXT,
  name TEXT,
  created_at INTEGER NOT NULL,
  seen_at INTEGER
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS memberships (
  team_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  member_id TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, uid)
);
CREATE INDEX IF NOT EXISTS memberships_uid ON memberships(uid);

CREATE TABLE IF NOT EXISTS items (
  team_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  updated_at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  by TEXT,
  PRIMARY KEY (team_id, kind, id)
);
CREATE INDEX IF NOT EXISTS items_seq ON items(team_id, seq);

CREATE TABLE IF NOT EXISTS referrals (
  uid TEXT PRIMARY KEY,
  by_uid TEXT NOT NULL,
  at INTEGER NOT NULL
);
