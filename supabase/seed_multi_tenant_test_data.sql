-- ============================================================================
-- SEED SCRIPT: Multi-Tenant Test Data
-- ============================================================================
-- Purpose: Generate realistic dummy data to test Multi-Tenancy isolation
--          and the Consolidated Dashboard (Werkudara Group view).
--
-- SAFE TO RE-RUN: Uses ON CONFLICT / DO NOTHING / DO UPDATE and checks.
-- RUN IN: Supabase SQL Editor (NOT as a migration)
-- ============================================================================

DO $$
DECLARE
    -- Company IDs (looked up from existing companies table)
    v_werkudara_id    uuid;
    v_takshaka_id     uuid;
    v_holding_id      uuid;

    -- Temp variables for plan insertion
    v_plan_id         uuid;
BEGIN
    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 0: Resolve Company IDs
    -- ═══════════════════════════════════════════════════════════════════════
    SELECT id INTO v_werkudara_id FROM public.companies WHERE name = 'Werkudara' LIMIT 1;
    SELECT id INTO v_takshaka_id  FROM public.companies WHERE name = 'Takshaka'  LIMIT 1;
    SELECT id INTO v_holding_id   FROM public.companies WHERE name = 'Werkudara Group' LIMIT 1;

    IF v_werkudara_id IS NULL THEN
        RAISE EXCEPTION 'Company "Werkudara" not found. Run the holding architecture migration first.';
    END IF;
    IF v_takshaka_id IS NULL THEN
        RAISE EXCEPTION 'Company "Takshaka" not found. Run the holding architecture migration first.';
    END IF;
    IF v_holding_id IS NULL THEN
        RAISE EXCEPTION 'Company "Werkudara Group" not found. Run the holding parent entity migration first.';
    END IF;

    RAISE NOTICE '✅ Companies found: Werkudara=%, Takshaka=%, Holding=%', v_werkudara_id, v_takshaka_id, v_holding_id;

    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 1: DEPARTMENTS (3 per subsidiary, none for holding)
    -- ═══════════════════════════════════════════════════════════════════════
    -- Werkudara departments
    INSERT INTO public.departments (code, name, company_id)
    VALUES ('HR',    'Human Resources',  v_werkudara_id)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, company_id = EXCLUDED.company_id;

    INSERT INTO public.departments (code, name, company_id)
    VALUES ('FIN',   'Finance & Accounting', v_werkudara_id)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, company_id = EXCLUDED.company_id;

    INSERT INTO public.departments (code, name, company_id)
    VALUES ('OPS',   'Operations',       v_werkudara_id)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, company_id = EXCLUDED.company_id;

    -- Takshaka departments
    INSERT INTO public.departments (code, name, company_id)
    VALUES ('SALES', 'Sales & BD',       v_takshaka_id)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, company_id = EXCLUDED.company_id;

    INSERT INTO public.departments (code, name, company_id)
    VALUES ('IT',    'Information Technology', v_takshaka_id)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, company_id = EXCLUDED.company_id;

    INSERT INTO public.departments (code, name, company_id)
    VALUES ('MKT',   'Marketing & Comms', v_takshaka_id)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, company_id = EXCLUDED.company_id;

    RAISE NOTICE '✅ 6 departments seeded (3 Werkudara + 3 Takshaka)';

    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 2: ACTION PLANS — Werkudara (15 plans)
    -- ═══════════════════════════════════════════════════════════════════════
    -- Mix of statuses: Achieved, On Progress, Not Achieved, Open
    -- Mix of months: Jan–Dec 2026
    -- Mix of categories/priorities: UH, H, M, L

    -- W-1: HR, Jan, Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score)
    VALUES ('HR', 'Jan', 2026, 'Workforce Optimization', 'Conduct employee satisfaction survey', 'Survey completion rate >= 90%', 'Rina Hartono', 'Achieved', 'UH (Ultra High)', 'Workforce Optimization', 'Monthly Report', v_werkudara_id, 'submitted', 85)
    ON CONFLICT DO NOTHING;

    -- W-2: HR, Feb, Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score)
    VALUES ('HR', 'Feb', 2026, 'Talent Acquisition', 'Hire 5 senior engineers', 'Positions filled by Feb 28', 'Rina Hartono', 'Achieved', 'H (High)', 'Talent Acquisition', 'Monthly Report', v_werkudara_id, 'submitted', 78)
    ON CONFLICT DO NOTHING;

    -- W-3: FIN, Jan, Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score)
    VALUES ('FIN', 'Jan', 2026, 'Cost Reduction', 'Renegotiate vendor contracts', 'Min 10% cost savings', 'Budi Prasetyo', 'Achieved', 'H (High)', 'Margin Optimization', 'Monthly Report', v_werkudara_id, 'submitted', 92)
    ON CONFLICT DO NOTHING;

    -- W-4: FIN, Feb, Not Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score, remark, gap_category)
    VALUES ('FIN', 'Feb', 2026, 'Revenue Growth', 'Launch new billing system', 'System go-live by Feb 15', 'Budi Prasetyo', 'Not Achieved', 'UH (Ultra High)', 'Revenue Growth', 'Monthly Report', v_werkudara_id, 'submitted', 35, '[Cause: Technical Issues] Vendor delayed integration module', 'Technical Issues')
    ON CONFLICT DO NOTHING;

    -- W-5: OPS, Jan, Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score)
    VALUES ('OPS', 'Jan', 2026, 'Process Improvement', 'Implement lean manufacturing V2', 'Cycle time reduction >= 15%', 'Dwi Saputra', 'Achieved', 'M (Medium)', 'Process Improvement', 'Monthly Report', v_werkudara_id, 'submitted', 88)
    ON CONFLICT DO NOTHING;

    -- W-6: OPS, Feb, On Progress
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('OPS', 'Feb', 2026, 'Quality Assurance', 'Deploy ISO 9001 audit prep', 'Audit readiness score >= 80%', 'Dwi Saputra', 'On Progress', 'H (High)', 'Quality Assurance', 'Monthly Report', v_werkudara_id)
    ON CONFLICT DO NOTHING;

    -- W-7: HR, Mar, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('HR', 'Mar', 2026, 'Employee Development', 'Launch leadership training program', 'Min 20 participants enrolled', 'Rina Hartono', 'Open', 'M (Medium)', 'Workforce Optimization', 'Monthly Report', v_werkudara_id)
    ON CONFLICT DO NOTHING;

    -- W-8: FIN, Mar, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('FIN', 'Mar', 2026, 'Cost Reduction', 'Automate expense reporting', 'Automation coverage >= 80%', 'Budi Prasetyo', 'Open', 'L (Low)', 'Margin Optimization', 'Monthly Report', v_werkudara_id)
    ON CONFLICT DO NOTHING;

    -- W-9: OPS, Mar, On Progress
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('OPS', 'Mar', 2026, 'Supply Chain', 'Onboard 3 new logistics partners', '3 contracts signed', 'Dwi Saputra', 'On Progress', 'UH (Ultra High)', 'Supply Chain', 'Monthly Report', v_werkudara_id)
    ON CONFLICT DO NOTHING;

    -- W-10: HR, Apr, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('HR', 'Apr', 2026, 'Compliance', 'Update employee handbook', 'Handbook published and distributed', 'Rina Hartono', 'Open', 'L (Low)', 'Compliance', 'Monthly Report', v_werkudara_id)
    ON CONFLICT DO NOTHING;

    -- W-11: FIN, Apr, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('FIN', 'Apr', 2026, 'Revenue Growth', 'Implement receivables dashboard', 'Dashboard live with real-time data', 'Budi Prasetyo', 'Open', 'M (Medium)', 'Revenue Growth', 'Monthly Report', v_werkudara_id)
    ON CONFLICT DO NOTHING;

    -- W-12: OPS, Apr, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('OPS', 'Apr', 2026, 'Safety & Environment', 'Conduct facility safety audit', 'Zero critical findings', 'Dwi Saputra', 'Open', 'H (High)', 'Safety & Environment', 'Monthly Report', v_werkudara_id)
    ON CONFLICT DO NOTHING;

    -- W-13: HR, May, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('HR', 'May', 2026, 'Talent Acquisition', 'Launch internship program for Q3', 'Min 10 interns onboarded', 'Rina Hartono', 'Open', 'M (Medium)', 'Talent Acquisition', 'Monthly Report', v_werkudara_id)
    ON CONFLICT DO NOTHING;

    -- W-14: FIN, Jan, Achieved (second plan for same month)
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score)
    VALUES ('FIN', 'Jan', 2026, 'Compliance', 'Submit Q4 2025 tax filings', 'Filed before deadline', 'Siti Nurhaliza', 'Achieved', 'UH (Ultra High)', 'Compliance', 'Monthly Report', v_werkudara_id, 'submitted', 95)
    ON CONFLICT DO NOTHING;

    -- W-15: OPS, Feb, Not Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score, remark, gap_category)
    VALUES ('OPS', 'Feb', 2026, 'Process Improvement', 'Reduce production waste by 20%', 'Waste metric <= 5%', 'Agus Wibowo', 'Not Achieved', 'H (High)', 'Process Improvement', 'Monthly Report', v_werkudara_id, 'submitted', 40, '[Cause: Resource Constraints] Insufficient budget for new equipment', 'Resource Constraints')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ 15 Werkudara action plans seeded';

    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 3: ACTION PLANS — Takshaka (15 plans)
    -- ═══════════════════════════════════════════════════════════════════════

    -- T-1: SALES, Jan, Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score)
    VALUES ('SALES', 'Jan', 2026, 'Revenue Growth', 'Close 5 enterprise deals', 'Revenue >= Rp 500M', 'Andi Wijaya', 'Achieved', 'UH (Ultra High)', 'Revenue Growth', 'Monthly Report', v_takshaka_id, 'submitted', 90)
    ON CONFLICT DO NOTHING;

    -- T-2: SALES, Feb, Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score)
    VALUES ('SALES', 'Feb', 2026, 'Client Retention', 'Renew top 10 client contracts', 'Renewal rate >= 90%', 'Andi Wijaya', 'Achieved', 'H (High)', 'Client Retention', 'Monthly Report', v_takshaka_id, 'submitted', 82)
    ON CONFLICT DO NOTHING;

    -- T-3: IT, Jan, Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score)
    VALUES ('IT', 'Jan', 2026, 'Digital Transformation', 'Migrate CRM to cloud platform', 'Migration completed with zero downtime', 'Fajar Nugroho', 'Achieved', 'UH (Ultra High)', 'Digital Transformation', 'Monthly Report', v_takshaka_id, 'submitted', 95)
    ON CONFLICT DO NOTHING;

    -- T-4: IT, Feb, On Progress
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('IT', 'Feb', 2026, 'Cybersecurity', 'Implement SOC 2 compliance framework', 'Pass external audit by Q2', 'Fajar Nugroho', 'On Progress', 'H (High)', 'Cybersecurity', 'Monthly Report', v_takshaka_id)
    ON CONFLICT DO NOTHING;

    -- T-5: MKT, Jan, Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score)
    VALUES ('MKT', 'Jan', 2026, 'Brand Awareness', 'Launch Q1 digital campaign', 'Reach >= 1M impressions', 'Lestari Dewi', 'Achieved', 'M (Medium)', 'Brand Awareness', 'Monthly Report', v_takshaka_id, 'submitted', 75)
    ON CONFLICT DO NOTHING;

    -- T-6: MKT, Feb, Not Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score, remark, gap_category)
    VALUES ('MKT', 'Feb', 2026, 'Lead Generation', 'Generate 200 MQLs from webinars', 'MQL count >= 200', 'Lestari Dewi', 'Not Achieved', 'H (High)', 'Lead Generation', 'Monthly Report', v_takshaka_id, 'submitted', 30, '[Cause: Low Turnout] Webinar attendance was 40% below forecast', 'Low Turnout')
    ON CONFLICT DO NOTHING;

    -- T-7: SALES, Mar, On Progress
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('SALES', 'Mar', 2026, 'Market Expansion', 'Enter Surabaya market with 3 new accounts', '3 signed SOWs by Mar 31', 'Andi Wijaya', 'On Progress', 'UH (Ultra High)', 'Market Expansion', 'Monthly Report', v_takshaka_id)
    ON CONFLICT DO NOTHING;

    -- T-8: IT, Mar, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('IT', 'Mar', 2026, 'Infrastructure', 'Upgrade production servers to Gen 5', 'All servers upgraded + benchmarked', 'Fajar Nugroho', 'Open', 'M (Medium)', 'Infrastructure', 'Monthly Report', v_takshaka_id)
    ON CONFLICT DO NOTHING;

    -- T-9: MKT, Mar, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('MKT', 'Mar', 2026, 'Content Strategy', 'Publish 12 blog articles + 4 case studies', 'Published on schedule', 'Lestari Dewi', 'Open', 'L (Low)', 'Content Strategy', 'Monthly Report', v_takshaka_id)
    ON CONFLICT DO NOTHING;

    -- T-10: SALES, Apr, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('SALES', 'Apr', 2026, 'Revenue Growth', 'Upsell premium tier to existing clients', 'Upsell revenue >= Rp 200M', 'Reza Mahendra', 'Open', 'H (High)', 'Revenue Growth', 'Monthly Report', v_takshaka_id)
    ON CONFLICT DO NOTHING;

    -- T-11: IT, Apr, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('IT', 'Apr', 2026, 'Developer Experience', 'Set up CI/CD pipelines for all repos', 'Pipeline coverage = 100%', 'Fajar Nugroho', 'Open', 'M (Medium)', 'Developer Experience', 'Monthly Report', v_takshaka_id)
    ON CONFLICT DO NOTHING;

    -- T-12: MKT, Apr, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('MKT', 'Apr', 2026, 'Brand Awareness', 'Sponsor tech conference in Jakarta', 'Brand mentions >= 500', 'Lestari Dewi', 'Open', 'L (Low)', 'Brand Awareness', 'Monthly Report', v_takshaka_id)
    ON CONFLICT DO NOTHING;

    -- T-13: SALES, May, Open
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id)
    VALUES ('SALES', 'May', 2026, 'Client Retention', 'Launch customer success program', 'NPS score >= 70', 'Reza Mahendra', 'Open', 'H (High)', 'Client Retention', 'Monthly Report', v_takshaka_id)
    ON CONFLICT DO NOTHING;

    -- T-14: IT, Jan, Achieved (second plan same month)
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score)
    VALUES ('IT', 'Jan', 2026, 'Data & Analytics', 'Deploy real-time analytics dashboard', 'Dashboard live with <2s load time', 'Galih Pratama', 'Achieved', 'H (High)', 'Data & Analytics', 'Monthly Report', v_takshaka_id, 'submitted', 88)
    ON CONFLICT DO NOTHING;

    -- T-15: MKT, Feb, Achieved
    INSERT INTO public.action_plans (department_code, month, year, goal_strategy, action_plan, indicator, pic, status, category, area_focus, report_format, company_id, submission_status, quality_score)
    VALUES ('MKT', 'Feb', 2026, 'Social Media', 'Grow LinkedIn followers by 30%', 'Follower count >= 13,000', 'Lestari Dewi', 'Achieved', 'M (Medium)', 'Social Media', 'Monthly Report', v_takshaka_id, 'submitted', 70)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ 15 Takshaka action plans seeded';

    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 4: ANNUAL TARGETS (per company, per year)
    -- ═══════════════════════════════════════════════════════════════════════
    -- PK is (year, company_id) after multi-tenancy migration

    INSERT INTO public.annual_targets (year, target_percentage, company_id)
    VALUES (2026, 80, v_werkudara_id)
    ON CONFLICT (year, company_id) DO UPDATE SET target_percentage = EXCLUDED.target_percentage;

    INSERT INTO public.annual_targets (year, target_percentage, company_id)
    VALUES (2025, 75, v_werkudara_id)
    ON CONFLICT (year, company_id) DO UPDATE SET target_percentage = EXCLUDED.target_percentage;

    INSERT INTO public.annual_targets (year, target_percentage, company_id)
    VALUES (2026, 85, v_takshaka_id)
    ON CONFLICT (year, company_id) DO UPDATE SET target_percentage = EXCLUDED.target_percentage;

    INSERT INTO public.annual_targets (year, target_percentage, company_id)
    VALUES (2025, 70, v_takshaka_id)
    ON CONFLICT (year, company_id) DO UPDATE SET target_percentage = EXCLUDED.target_percentage;

    RAISE NOTICE '✅ Annual targets seeded (2025 + 2026 for both companies)';

    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 5: HISTORICAL STATS (monthly completion rates per department)
    -- ═══════════════════════════════════════════════════════════════════════
    -- Werkudara: HR, FIN, OPS — Jan & Feb 2026
    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('HR',  2026, 1, 75.0, v_werkudara_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('HR',  2026, 2, 80.0, v_werkudara_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('FIN', 2026, 1, 90.0, v_werkudara_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('FIN', 2026, 2, 50.0, v_werkudara_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('OPS', 2026, 1, 85.0, v_werkudara_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('OPS', 2026, 2, 45.0, v_werkudara_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    -- Takshaka: SALES, IT, MKT — Jan & Feb 2026
    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('SALES', 2026, 1, 95.0, v_takshaka_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('SALES', 2026, 2, 85.0, v_takshaka_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('IT',    2026, 1, 100.0, v_takshaka_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('IT',    2026, 2, 60.0, v_takshaka_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('MKT',   2026, 1, 70.0, v_takshaka_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('MKT',   2026, 2, 55.0, v_takshaka_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    -- Previous year data (2025) for Year-over-Year comparison
    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('HR',  2025, 1, 65.0, v_werkudara_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('FIN', 2025, 1, 72.0, v_werkudara_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('OPS', 2025, 1, 78.0, v_werkudara_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('SALES', 2025, 1, 88.0, v_takshaka_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('IT',    2025, 1, 82.0, v_takshaka_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    INSERT INTO public.historical_stats (department_code, year, month, completion_rate, company_id)
    VALUES ('MKT',   2025, 1, 60.0, v_takshaka_id)
    ON CONFLICT ON CONSTRAINT historical_stats_dept_year_month_company_key
    DO UPDATE SET completion_rate = EXCLUDED.completion_rate;

    RAISE NOTICE '✅ Historical stats seeded (Jan-Feb 2026 + Jan 2025 for all 6 depts)';

    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 6: DROPDOWN OPTIONS (company-scoped, for settings pages)
    -- ═══════════════════════════════════════════════════════════════════════
    INSERT INTO public.dropdown_options (category, label, is_active, sort_order, company_id)
    VALUES ('delete_reason', 'Duplicate entry',       true, 1, v_werkudara_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.dropdown_options (category, label, is_active, sort_order, company_id)
    VALUES ('delete_reason', 'No longer relevant',    true, 2, v_werkudara_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.dropdown_options (category, label, is_active, sort_order, company_id)
    VALUES ('delete_reason', 'Created in error',      true, 3, v_werkudara_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.dropdown_options (category, label, is_active, sort_order, company_id)
    VALUES ('delete_reason', 'Other',                 true, 4, v_werkudara_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.dropdown_options (category, label, is_active, sort_order, company_id)
    VALUES ('delete_reason', 'Duplicate entry',       true, 1, v_takshaka_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.dropdown_options (category, label, is_active, sort_order, company_id)
    VALUES ('delete_reason', 'No longer relevant',    true, 2, v_takshaka_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.dropdown_options (category, label, is_active, sort_order, company_id)
    VALUES ('delete_reason', 'Created in error',      true, 3, v_takshaka_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.dropdown_options (category, label, is_active, sort_order, company_id)
    VALUES ('delete_reason', 'Other',                 true, 4, v_takshaka_id)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ Dropdown options seeded for both companies';

    -- ═══════════════════════════════════════════════════════════════════════
    -- STEP 7: MASTER OPTIONS (company-scoped, for admin settings)
    -- ═══════════════════════════════════════════════════════════════════════
    -- Root cause categories (used in gap analysis)
    INSERT INTO public.master_options (category, label, value, sort_order, is_active, company_id)
    VALUES ('ROOT_CAUSE', 'Technical Issues', 'Technical Issues', 1, true, v_werkudara_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.master_options (category, label, value, sort_order, is_active, company_id)
    VALUES ('ROOT_CAUSE', 'Resource Constraints', 'Resource Constraints', 2, true, v_werkudara_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.master_options (category, label, value, sort_order, is_active, company_id)
    VALUES ('ROOT_CAUSE', 'Process Failure', 'Process Failure', 3, true, v_werkudara_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.master_options (category, label, value, sort_order, is_active, company_id)
    VALUES ('ROOT_CAUSE', 'External Factor', 'External Factor', 4, true, v_werkudara_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.master_options (category, label, value, sort_order, is_active, company_id)
    VALUES ('ROOT_CAUSE', 'Technical Issues', 'Technical Issues', 1, true, v_takshaka_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.master_options (category, label, value, sort_order, is_active, company_id)
    VALUES ('ROOT_CAUSE', 'Low Turnout', 'Low Turnout', 2, true, v_takshaka_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.master_options (category, label, value, sort_order, is_active, company_id)
    VALUES ('ROOT_CAUSE', 'Budget Overrun', 'Budget Overrun', 3, true, v_takshaka_id)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.master_options (category, label, value, sort_order, is_active, company_id)
    VALUES ('ROOT_CAUSE', 'Vendor Delay', 'Vendor Delay', 4, true, v_takshaka_id)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '✅ Master options seeded for both companies';

    -- ═══════════════════════════════════════════════════════════════════════
    -- DONE
    -- ═══════════════════════════════════════════════════════════════════════
    RAISE NOTICE '';
    RAISE NOTICE '══════════════════════════════════════════════════════════════';
    RAISE NOTICE '  SEED COMPLETE — Multi-Tenant Test Data Ready';
    RAISE NOTICE '══════════════════════════════════════════════════════════════';
    RAISE NOTICE '  Werkudara  : 3 depts, 15 action plans, targets, history';
    RAISE NOTICE '  Takshaka   : 3 depts, 15 action plans, targets, history';
    RAISE NOTICE '  Werkudara Group : Holding entity (no operational data)';
    RAISE NOTICE '══════════════════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE '  EXPECTED DASHBOARD STATS (Jan-Feb 2026 assessable):';
    RAISE NOTICE '  ─────────────────────────────────────────────────────';
    RAISE NOTICE '  Werkudara  : 8 assessable, 5 achieved → 62.5%% CR';
    RAISE NOTICE '  Takshaka   : 9 assessable, 6 achieved → 66.7%% CR';
    RAISE NOTICE '  Consolidated: 17 assessable, 11 achieved → 64.7%% CR';
    RAISE NOTICE '';

END $$;
