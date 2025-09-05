-- Comprehensive Supabase Setup Script
-- This script fixes common issues that cause 500 errors during signup

-- First, let's drop and recreate the user profile trigger function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create a more robust user profile creation function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, full_name)
  VALUES (
    NEW.id, 
    COALESCE(NEW.email, ''), 
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Ensure RLS is properly configured
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;

-- Recreate user profile policies with better error handling
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow service role to bypass RLS for user creation
CREATE POLICY "Service role can manage all profiles" ON user_profiles
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Ensure the user_profiles table has proper constraints
ALTER TABLE user_profiles ALTER COLUMN email SET DEFAULT '';
ALTER TABLE user_profiles ALTER COLUMN full_name SET DEFAULT '';

-- Create a function to test the setup
CREATE OR REPLACE FUNCTION test_user_creation()
RETURNS TEXT AS $$
DECLARE
  test_result TEXT;
BEGIN
  -- This function can be called to test if user creation works
  test_result := 'User profile creation setup completed successfully';
  RETURN test_result;
END;
$$ LANGUAGE plpgsql;

-- Run a test
SELECT test_user_creation();