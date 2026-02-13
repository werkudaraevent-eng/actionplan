-- ============================================================================
-- MIGRATION: Seed AREA_OF_FOCUS into master_options
-- Only inserts if no AREA_OF_FOCUS rows exist yet.
-- ============================================================================

INSERT INTO public.master_options (category, label, value, sort_order)
SELECT category, label, value, sort_order
FROM (VALUES
    ('AREA_OF_FOCUS', 'End to End Business Process Implementation', 'End to End Business Process Implementation', 1),
    ('AREA_OF_FOCUS', 'High Value Market Repositioning',           'High Value Market Repositioning',           2),
    ('AREA_OF_FOCUS', 'Margin Optimization',                       'Margin Optimization',                       3),
    ('AREA_OF_FOCUS', 'Sales Performance Acceleration',            'Sales Performance Acceleration',             4),
    ('AREA_OF_FOCUS', 'Workforce Optimization',                    'Workforce Optimization',                    5)
) AS seed(category, label, value, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM public.master_options WHERE category = 'AREA_OF_FOCUS'
);
