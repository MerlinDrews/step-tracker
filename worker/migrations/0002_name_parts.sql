-- Keep full name parts server-side for disambiguation; `name` holds the public display form.
ALTER TABLE steps ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE steps ADD COLUMN last_name TEXT NOT NULL DEFAULT '';
