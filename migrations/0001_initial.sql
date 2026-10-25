CREATE TABLE survey_responses (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
  submission_hash TEXT NOT NULL UNIQUE CHECK(length(submission_hash) = 64),
  created_at TEXT NOT NULL, version TEXT NOT NULL,
  answers TEXT NOT NULL CHECK(json_valid(answers)), scoring TEXT NOT NULL CHECK(json_valid(scoring))
);
CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY NOT NULL, credential_version TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE admin_login_attempts (bucket INTEGER PRIMARY KEY, attempts INTEGER NOT NULL);
