PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  base_url TEXT,
  reliability TEXT NOT NULL DEFAULT 'secondary'
);

CREATE TABLE IF NOT EXISTS horses (
  id INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  birth_year INTEGER,
  breed TEXT,
  sex TEXT,
  sire TEXT,
  dam TEXT,
  owner TEXT
);

CREATE TABLE IF NOT EXISTS jockeys (
  id INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS trainers (
  id INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS races (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  source_race_id TEXT,
  date TEXT NOT NULL,
  venue TEXT NOT NULL,
  race_no INTEGER,
  name TEXT,
  race_class TEXT,
  age_condition TEXT,
  breed TEXT,
  sex_condition TEXT,
  distance_m INTEGER,
  surface TEXT,
  direction TEXT,
  weather TEXT,
  track_condition TEXT,
  winner_time TEXT,
  UNIQUE(source_id, source_race_id)
);

CREATE TABLE IF NOT EXISTS race_entries (
  id INTEGER PRIMARY KEY,
  race_id INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  horse_id INTEGER NOT NULL REFERENCES horses(id),
  jockey_id INTEGER REFERENCES jockeys(id),
  trainer_id INTEGER REFERENCES trainers(id),
  gate INTEGER,
  weight REAL,
  handicap_point REAL,
  starting_price TEXT,
  finish_position INTEGER,
  finish_time TEXT,
  margin TEXT,
  last_800 TEXT,
  last_600 TEXT,
  scratched INTEGER NOT NULL DEFAULT 0,
  UNIQUE(race_id, horse_id)
);

CREATE TABLE IF NOT EXISTS race_aliases (
  id INTEGER PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  alias TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS gazi_watchlist (
  id INTEGER PRIMARY KEY,
  year INTEGER NOT NULL,
  horse_id INTEGER NOT NULL REFERENCES horses(id),
  status TEXT NOT NULL DEFAULT 'candidate',
  source_note TEXT,
  UNIQUE(year, horse_id)
);

CREATE TABLE IF NOT EXISTS derived_features (
  id INTEGER PRIMARY KEY,
  horse_id INTEGER NOT NULL REFERENCES horses(id),
  as_of_date TEXT NOT NULL,
  gazi_year INTEGER NOT NULL,
  gazi_fit_score REAL,
  class_score REAL,
  stamina_score REAL,
  course_score REAL,
  form_score REAL,
  jockey_score REAL,
  data_confidence REAL,
  explanation TEXT,
  UNIQUE(horse_id, as_of_date, gazi_year)
);

CREATE INDEX IF NOT EXISTS idx_races_date ON races(date);
CREATE INDEX IF NOT EXISTS idx_races_profile ON races(distance_m, surface, breed, age_condition);
CREATE INDEX IF NOT EXISTS idx_entries_horse ON race_entries(horse_id);
CREATE INDEX IF NOT EXISTS idx_entries_jockey ON race_entries(jockey_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_year ON gazi_watchlist(year, status);
