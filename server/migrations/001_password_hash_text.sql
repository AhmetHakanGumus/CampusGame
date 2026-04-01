-- Ensure users.password_hash supports long Argon2id outputs
ALTER TABLE users
ALTER COLUMN password_hash TYPE TEXT;
