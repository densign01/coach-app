-- Coach App Database Schema
-- Run this in your Supabase SQL Editor

-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT,
  auth_provider TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User profiles
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  height_cm NUMERIC,
  weight_kg NUMERIC,
  age INTEGER,
  gender TEXT,
  goals TEXT,
  onboarding_step INTEGER DEFAULT 0,
  onboarding_data JSONB,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_username ON profiles(username);

-- Days table (tracks daily plans and targets)
CREATE TABLE days (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  targets_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meals table
CREATE TABLE meals (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL REFERENCES days(id),
  type TEXT NOT NULL CHECK (type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  items_json JSONB NOT NULL,
  macros_json JSONB,
  source TEXT DEFAULT 'est' CHECK (source IN ('est', 'api', 'vision')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meal drafts (temporary storage for AI parsed meals)
CREATE TABLE meal_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  temp_id TEXT NOT NULL,
  parsed_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Workouts table
CREATE TABLE workouts (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL REFERENCES days(id),
  type TEXT NOT NULL,
  minutes INTEGER,
  distance DECIMAL,
  raw_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily summaries
CREATE TABLE summaries (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL REFERENCES days(id),
  daily_totals_json JSONB,
  coach_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Health integrations
CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  scopes TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Health data samples
CREATE TABLE health_samples (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  value DECIMAL NOT NULL,
  unit TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  source TEXT
);

-- Create indexes for better performance
CREATE INDEX idx_days_user_date ON days(user_id, date);
CREATE INDEX idx_meals_day_id ON meals(day_id);
CREATE INDEX idx_workouts_day_id ON workouts(day_id);
CREATE INDEX idx_meal_drafts_user_temp ON meal_drafts(user_id, temp_id);
CREATE INDEX idx_health_samples_user_type ON health_samples(user_id, type);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE days ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_samples ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (you can customize these later)
-- For now, allow all operations for authenticated users

CREATE POLICY "Users can manage their own data" ON users
  FOR ALL USING (id = auth.uid()::text);

CREATE POLICY "Users manage their profile" ON profiles
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users can manage their days" ON days
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users can access meals through days" ON meals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM days
      WHERE days.id = meals.day_id
      AND days.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can manage their meal drafts" ON meal_drafts
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users can access workouts through days" ON workouts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM days
      WHERE days.id = workouts.day_id
      AND days.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can access summaries through days" ON summaries
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM days
      WHERE days.id = summaries.day_id
      AND days.user_id = auth.uid()::text
    )
  );

CREATE POLICY "Users can manage their integrations" ON integrations
  FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "Users can manage their health data" ON health_samples
  FOR ALL USING (user_id = auth.uid()::text);
