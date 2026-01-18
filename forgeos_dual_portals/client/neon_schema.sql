-- ForgeOS CRM + Client Portal schema (Neon Postgres)
-- Run in Neon SQL editor.

-- Enable UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Companies
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text DEFAULT 'lead',
  phone text,
  website text,
  address text,
  lat double precision,
  lng double precision,
  rating numeric,
  reviews integer,
  external_place_id text,
  portal_email text,        -- email used for client portal login mapping
  billing_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Contacts (optional; kept for CRM)
CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  name text,
  email text,
  phone text,
  position text,
  status text DEFAULT 'lead',
  source text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Deals (optional; kept for CRM)
CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  value numeric DEFAULT 0,
  probability integer DEFAULT 0,
  stage text DEFAULT 'Discovery',
  close_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tasks (optional; kept for CRM)
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  project text,
  priority text DEFAULT 'medium',
  due_date date,
  status text DEFAULT 'Not Started',
  estimate_mins integer DEFAULT 30,
  energy text DEFAULT 'Deep',
  type text DEFAULT 'Delivery',
  deal_id uuid,
  impact integer DEFAULT 3,
  urgency integer DEFAULT 3,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Project tracking (Client-visible)
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text DEFAULT 'Planning',
  percent_complete integer DEFAULT 0,
  start_date date,
  due_date date,
  last_update text,
  client_visible boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);

-- NOTE: If you already created these tables in earlier iterations,
-- you can instead run ALTERs:
-- ALTER TABLE companies ADD COLUMN IF NOT EXISTS portal_email text;
-- ALTER TABLE companies ADD COLUMN IF NOT EXISTS billing_email text;
