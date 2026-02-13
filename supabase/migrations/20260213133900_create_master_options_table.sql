-- ============================================================================
-- MIGRATION: Create Universal "Master Options" Table
-- Purpose: Centralized, admin-manageable lookup table for all dropdown/reference
--          data across the application. Replaces scattered hardcoded lists.
-- Categories: ROOT_CAUSE, PRIORITY, DEPARTMENT (initial), extensible for future use.
-- ============================================================================

-- 1. CREATE TABLE
CREATE TABLE IF NOT EXISTS public.master_options (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category    VARCHAR(50) NOT NULL,        -- e.g. 'ROOT_CAUSE', 'PRIORITY', 'DEPARTMENT'
    label       TEXT NOT NULL,                -- Display text shown to users
    value       TEXT NOT NULL,                -- Value stored in database fields
    sort_order  INTEGER DEFAULT 0,           -- For controlling display order
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. INDEXES for fast category-based lookups
CREATE INDEX IF NOT EXISTS idx_master_options_category
    ON public.master_options (category);

CREATE INDEX IF NOT EXISTS idx_master_options_category_active
    ON public.master_options (category, is_active)
    WHERE is_active = TRUE;

-- Unique constraint: no duplicate value within the same category
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_options_unique_value
    ON public.master_options (category, value);

-- 3. ENABLE RLS
ALTER TABLE public.master_options ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICIES

-- Read: All authenticated users can read active options
CREATE POLICY "master_options_read_authenticated"
    ON public.master_options
    FOR SELECT
    TO authenticated
    USING (TRUE);

-- Insert: Admin only (role = 'admin' in user_profiles)
CREATE POLICY "master_options_insert_admin"
    ON public.master_options
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    );

-- Update: Admin only
CREATE POLICY "master_options_update_admin"
    ON public.master_options
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    );

-- Delete: Admin only
CREATE POLICY "master_options_delete_admin"
    ON public.master_options
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role = 'admin'
        )
    );

-- 5. SEED DATA
-- ==========================================================================

-- 5a. ROOT CAUSES (used in gap analysis / failure investigation)
INSERT INTO public.master_options (category, label, value, sort_order) VALUES
    ('ROOT_CAUSE', 'Manpower',          'Manpower',          1),
    ('ROOT_CAUSE', 'Method',            'Method',            2),
    ('ROOT_CAUSE', 'Machine',           'Machine',           3),
    ('ROOT_CAUSE', 'Material',          'Material',          4),
    ('ROOT_CAUSE', 'Environment',       'Environment',       5),
    ('ROOT_CAUSE', 'External Factors',  'External Factors',  6)
ON CONFLICT (category, value) DO NOTHING;

-- 5b. PRIORITIES (action plan priority/category classification)
INSERT INTO public.master_options (category, label, value, sort_order) VALUES
    ('PRIORITY', 'Ultra High',  'UH', 1),
    ('PRIORITY', 'High',        'H',  2),
    ('PRIORITY', 'Medium',      'M',  3),
    ('PRIORITY', 'Low',         'L',  4)
ON CONFLICT (category, value) DO NOTHING;

-- 5c. DEPARTMENTS (migrated from hardcoded DEPARTMENTS constant in supabase.js)
INSERT INTO public.master_options (category, label, value, sort_order) VALUES
    ('DEPARTMENT', 'Accounting',                          'ACC', 1),
    ('DEPARTMENT', 'Art & Creative Support',              'ACS', 2),
    ('DEPARTMENT', 'Business & Administration Services',  'BAS', 3),
    ('DEPARTMENT', 'Business & Innovation Development',   'BID', 4),
    ('DEPARTMENT', 'Corporate Finance Controller',        'CFC', 5),
    ('DEPARTMENT', 'Corporate Marketing Communication',   'CMC', 6),
    ('DEPARTMENT', 'Corporate Travel',                    'CT',  7),
    ('DEPARTMENT', 'General Affairs',                     'GA',  8),
    ('DEPARTMENT', 'Human Resources',                     'HR',  9),
    ('DEPARTMENT', 'Product Development',                 'PD',  10),
    ('DEPARTMENT', 'Sales Operation',                     'SO',  11),
    ('DEPARTMENT', 'Strategic Sourcing',                  'SS',  12),
    ('DEPARTMENT', 'Tour and Event Planning',             'TEP', 13)
ON CONFLICT (category, value) DO NOTHING;

-- Add a comment documenting the table purpose
COMMENT ON TABLE public.master_options IS
    'Universal lookup table for all admin-managed dropdown options. '
    'Use category to group related options (e.g. ROOT_CAUSE, PRIORITY, DEPARTMENT). '
    'The value field stores the DB-persisted identifier; label is the user-facing text.';
