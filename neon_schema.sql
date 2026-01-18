-- ForgeOS CRM (Neon) schema
-- Run this in Neon SQL Editor once.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  phone text,
  website text,
  address text,
  lat double precision,
  lng double precision,
  rating double precision,
  reviews integer DEFAULT 0,
  external_place_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  name text NOT NULL DEFAULT '',
  email text,
  phone text,
  title text,
  role text NOT NULL DEFAULT 'external',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON contacts(company_id);

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  text text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
