create extension if not exists "pg_cron" with schema "pg_catalog";

drop extension if exists "pg_net";

create sequence "public"."monthly_lock_schedules_id_seq";


  create table "public"."action_plans" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "department_code" text not null,
    "month" text not null,
    "goal_strategy" text not null,
    "action_plan" text not null,
    "indicator" text not null,
    "pic" text not null,
    "report_format" text not null default 'Monthly Report'::text,
    "status" text not null default 'Open'::text,
    "outcome_link" text,
    "remark" text,
    "year" integer not null default 2026,
    "deleted_at" timestamp with time zone,
    "deleted_by" text,
    "deletion_reason" text,
    "quality_score" integer,
    "leader_feedback" text,
    "reviewed_by" uuid,
    "reviewed_at" timestamp with time zone,
    "admin_feedback" text,
    "submission_status" character varying(20) default 'draft'::character varying,
    "submitted_at" timestamp with time zone,
    "submitted_by" uuid,
    "area_focus" text,
    "category" text,
    "evidence" text,
    "gap_category" text,
    "gap_analysis" text,
    "specify_reason" text,
    "unlock_status" text,
    "unlock_reason" text,
    "unlock_requested_at" timestamp with time zone,
    "unlock_requested_by" uuid,
    "unlock_approved_by" uuid,
    "unlock_approved_at" timestamp with time zone,
    "approved_until" timestamp with time zone,
    "unlock_rejection_reason" text,
    "blocker_reason" text,
    "is_carry_over" boolean default false,
    "is_blocked" boolean default false,
    "blocker_category" text,
    "attention_level" text not null default 'Standard'::text,
    "carry_over_status" text not null default 'Normal'::text,
    "origin_plan_id" uuid,
    "max_possible_score" integer not null default 100,
    "resolution_type" text,
    "carried_to_month" text,
    "is_drop_pending" boolean default false,
    "temporary_unlock_expiry" timestamp with time zone,
    "attachments" jsonb default '[]'::jsonb
      );


alter table "public"."action_plans" enable row level security;


  create table "public"."annual_targets" (
    "year" integer not null,
    "target_percentage" integer not null default 80,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."annual_targets" enable row level security;


  create table "public"."audit_logs" (
    "id" uuid not null default gen_random_uuid(),
    "action_plan_id" uuid not null,
    "user_id" uuid,
    "change_type" text not null,
    "previous_value" jsonb,
    "new_value" jsonb not null,
    "description" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."audit_logs" enable row level security;


  create table "public"."departments" (
    "code" text not null,
    "name" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."departments" enable row level security;


  create table "public"."drop_requests" (
    "id" uuid not null default gen_random_uuid(),
    "plan_id" uuid not null,
    "user_id" uuid not null,
    "reason" text not null,
    "status" text not null default 'PENDING'::text,
    "created_at" timestamp with time zone not null default now(),
    "reviewed_at" timestamp with time zone,
    "reviewed_by" uuid
      );


alter table "public"."drop_requests" enable row level security;


  create table "public"."dropdown_options" (
    "id" uuid not null default gen_random_uuid(),
    "category" character varying(50) not null,
    "label" character varying(255) not null,
    "is_active" boolean default true,
    "sort_order" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."dropdown_options" enable row level security;


  create table "public"."historical_stats" (
    "id" uuid not null default gen_random_uuid(),
    "department_code" text not null,
    "year" integer not null,
    "month" integer not null,
    "completion_rate" numeric(5,2) not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."historical_stats" enable row level security;


  create table "public"."master_options" (
    "id" uuid not null default gen_random_uuid(),
    "category" character varying(50) not null,
    "label" text not null,
    "value" text not null,
    "sort_order" integer default 0,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."master_options" enable row level security;


  create table "public"."monthly_lock_schedules" (
    "id" integer not null default nextval('public.monthly_lock_schedules_id_seq'::regclass),
    "month_index" integer not null,
    "year" integer not null,
    "lock_date" timestamp with time zone not null,
    "created_at" timestamp with time zone default now(),
    "created_by" uuid,
    "is_force_open" boolean default false
      );


alter table "public"."monthly_lock_schedules" enable row level security;


  create table "public"."notifications" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "actor_id" uuid,
    "resource_id" uuid not null,
    "resource_type" text not null,
    "type" text not null,
    "title" text,
    "message" text,
    "is_read" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "read_at" timestamp with time zone
      );


alter table "public"."notifications" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "email" text not null,
    "full_name" text not null,
    "role" text not null,
    "department_code" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "additional_departments" text[] default '{}'::text[]
      );


alter table "public"."profiles" enable row level security;


  create table "public"."progress_logs" (
    "id" uuid not null default gen_random_uuid(),
    "action_plan_id" uuid not null,
    "user_id" uuid,
    "message" text not null,
    "created_at" timestamp with time zone default now(),
    "type" character varying(50) default 'comment'::character varying
      );


alter table "public"."progress_logs" enable row level security;


  create table "public"."role_permissions" (
    "id" uuid not null default gen_random_uuid(),
    "role" text not null,
    "resource" text not null,
    "action" text not null,
    "is_allowed" boolean not null default false,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."role_permissions" enable row level security;


  create table "public"."system_settings" (
    "id" integer not null default 1,
    "is_lock_enabled" boolean default true,
    "lock_cutoff_day" integer default 6,
    "updated_at" timestamp with time zone default now(),
    "updated_by" uuid,
    "email_config" jsonb default '{}'::jsonb,
    "carry_over_penalty_1" integer not null default 80,
    "carry_over_penalty_2" integer not null default 50,
    "is_strict_grading_enabled" boolean not null default false,
    "standard_passing_score" integer not null default 80,
    "threshold_uh" integer not null default 100,
    "threshold_h" integer not null default 100,
    "threshold_m" integer not null default 80,
    "threshold_l" integer not null default 70,
    "drop_approval_req_uh" boolean default false,
    "drop_approval_req_h" boolean default false,
    "drop_approval_req_m" boolean default false,
    "drop_approval_req_l" boolean default false
      );


alter table "public"."system_settings" enable row level security;

alter sequence "public"."monthly_lock_schedules_id_seq" owned by "public"."monthly_lock_schedules"."id";

CREATE UNIQUE INDEX action_plans_pkey ON public.action_plans USING btree (id);

CREATE UNIQUE INDEX annual_targets_pkey ON public.annual_targets USING btree (year);

CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id);

CREATE UNIQUE INDEX departments_pkey ON public.departments USING btree (code);

CREATE UNIQUE INDEX drop_requests_pkey ON public.drop_requests USING btree (id);

CREATE UNIQUE INDEX dropdown_options_category_label_key ON public.dropdown_options USING btree (category, label);

CREATE UNIQUE INDEX dropdown_options_pkey ON public.dropdown_options USING btree (id);

CREATE UNIQUE INDEX historical_stats_department_code_year_month_key ON public.historical_stats USING btree (department_code, year, month);

CREATE UNIQUE INDEX historical_stats_pkey ON public.historical_stats USING btree (id);

CREATE INDEX idx_action_plans_deleted_at ON public.action_plans USING btree (deleted_at);

CREATE INDEX idx_action_plans_deleted_dept ON public.action_plans USING btree (department_code, deleted_at) WHERE (deleted_at IS NOT NULL);

CREATE INDEX idx_action_plans_department ON public.action_plans USING btree (department_code);

CREATE INDEX idx_action_plans_gap_category ON public.action_plans USING btree (gap_category) WHERE (gap_category IS NOT NULL);

CREATE INDEX idx_action_plans_month ON public.action_plans USING btree (month);

CREATE INDEX idx_action_plans_origin_plan_id ON public.action_plans USING btree (origin_plan_id) WHERE (origin_plan_id IS NOT NULL);

CREATE INDEX idx_action_plans_quality_score ON public.action_plans USING btree (quality_score);

CREATE INDEX idx_action_plans_status ON public.action_plans USING btree (status);

CREATE INDEX idx_action_plans_submission_status ON public.action_plans USING btree (submission_status);

CREATE INDEX idx_action_plans_year_dept ON public.action_plans USING btree (year, department_code);

CREATE INDEX idx_action_plans_year_month ON public.action_plans USING btree (year, month);

CREATE INDEX idx_action_plans_year_status ON public.action_plans USING btree (year, status);

CREATE INDEX idx_audit_logs_action_plan ON public.audit_logs USING btree (action_plan_id);

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);

CREATE INDEX idx_drop_requests_plan_id ON public.drop_requests USING btree (plan_id);

CREATE INDEX idx_drop_requests_status ON public.drop_requests USING btree (status);

CREATE INDEX idx_dropdown_options_active ON public.dropdown_options USING btree (is_active);

CREATE INDEX idx_dropdown_options_category ON public.dropdown_options USING btree (category);

CREATE INDEX idx_historical_stats_dept ON public.historical_stats USING btree (department_code);

CREATE INDEX idx_historical_stats_lookup ON public.historical_stats USING btree (department_code, year);

CREATE INDEX idx_historical_stats_year ON public.historical_stats USING btree (year);

CREATE INDEX idx_master_options_category ON public.master_options USING btree (category);

CREATE INDEX idx_master_options_category_active ON public.master_options USING btree (category, is_active) WHERE (is_active = true);

CREATE UNIQUE INDEX idx_master_options_unique_value ON public.master_options USING btree (category, value);

CREATE INDEX idx_monthly_lock_schedules_month_year ON public.monthly_lock_schedules USING btree (month_index, year);

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);

CREATE INDEX idx_notifications_resource ON public.notifications USING btree (resource_id, resource_type);

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);

CREATE INDEX idx_profiles_additional_departments ON public.profiles USING gin (additional_departments);

CREATE INDEX idx_profiles_department ON public.profiles USING btree (department_code);

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);

CREATE INDEX idx_progress_logs_action_plan_id ON public.progress_logs USING btree (action_plan_id);

CREATE INDEX idx_progress_logs_created_at ON public.progress_logs USING btree (created_at DESC);

CREATE INDEX idx_role_permissions_resource ON public.role_permissions USING btree (resource);

CREATE INDEX idx_role_permissions_role ON public.role_permissions USING btree (role);

CREATE UNIQUE INDEX master_options_pkey ON public.master_options USING btree (id);

CREATE UNIQUE INDEX monthly_lock_schedules_month_index_year_key ON public.monthly_lock_schedules USING btree (month_index, year);

CREATE UNIQUE INDEX monthly_lock_schedules_pkey ON public.monthly_lock_schedules USING btree (id);

CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX progress_logs_pkey ON public.progress_logs USING btree (id);

CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (id);

CREATE UNIQUE INDEX role_permissions_unique ON public.role_permissions USING btree (role, resource, action);

CREATE UNIQUE INDEX system_settings_pkey ON public.system_settings USING btree (id);

CREATE UNIQUE INDEX system_settings_single_row ON public.system_settings USING btree (((id = 1)));

alter table "public"."action_plans" add constraint "action_plans_pkey" PRIMARY KEY using index "action_plans_pkey";

alter table "public"."annual_targets" add constraint "annual_targets_pkey" PRIMARY KEY using index "annual_targets_pkey";

alter table "public"."audit_logs" add constraint "audit_logs_pkey" PRIMARY KEY using index "audit_logs_pkey";

alter table "public"."departments" add constraint "departments_pkey" PRIMARY KEY using index "departments_pkey";

alter table "public"."drop_requests" add constraint "drop_requests_pkey" PRIMARY KEY using index "drop_requests_pkey";

alter table "public"."dropdown_options" add constraint "dropdown_options_pkey" PRIMARY KEY using index "dropdown_options_pkey";

alter table "public"."historical_stats" add constraint "historical_stats_pkey" PRIMARY KEY using index "historical_stats_pkey";

alter table "public"."master_options" add constraint "master_options_pkey" PRIMARY KEY using index "master_options_pkey";

alter table "public"."monthly_lock_schedules" add constraint "monthly_lock_schedules_pkey" PRIMARY KEY using index "monthly_lock_schedules_pkey";

alter table "public"."notifications" add constraint "notifications_pkey" PRIMARY KEY using index "notifications_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."progress_logs" add constraint "progress_logs_pkey" PRIMARY KEY using index "progress_logs_pkey";

alter table "public"."role_permissions" add constraint "role_permissions_pkey" PRIMARY KEY using index "role_permissions_pkey";

alter table "public"."system_settings" add constraint "system_settings_pkey" PRIMARY KEY using index "system_settings_pkey";

alter table "public"."action_plans" add constraint "action_plans_attention_level_check" CHECK ((attention_level = ANY (ARRAY['Standard'::text, 'Leader'::text, 'Management_BOD'::text]))) not valid;

alter table "public"."action_plans" validate constraint "action_plans_attention_level_check";

alter table "public"."action_plans" add constraint "action_plans_blocker_category_check" CHECK ((blocker_category = ANY (ARRAY['Internal'::text, 'External'::text, 'Budget'::text, 'Approval'::text]))) not valid;

alter table "public"."action_plans" validate constraint "action_plans_blocker_category_check";

alter table "public"."action_plans" add constraint "action_plans_origin_plan_id_fkey" FOREIGN KEY (origin_plan_id) REFERENCES public.action_plans(id) not valid;

alter table "public"."action_plans" validate constraint "action_plans_origin_plan_id_fkey";

alter table "public"."action_plans" add constraint "action_plans_quality_score_check" CHECK (((quality_score >= 0) AND (quality_score <= 100))) not valid;

alter table "public"."action_plans" validate constraint "action_plans_quality_score_check";

alter table "public"."action_plans" add constraint "action_plans_resolution_type_check" CHECK (((resolution_type IS NULL) OR (resolution_type = ANY (ARRAY['carried_over'::text, 'dropped'::text])))) not valid;

alter table "public"."action_plans" validate constraint "action_plans_resolution_type_check";

alter table "public"."action_plans" add constraint "action_plans_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) not valid;

alter table "public"."action_plans" validate constraint "action_plans_reviewed_by_fkey";

alter table "public"."action_plans" add constraint "action_plans_status_check" CHECK ((status = ANY (ARRAY['Open'::text, 'On Progress'::text, 'Blocked'::text, 'Achieved'::text, 'Not Achieved'::text, 'Internal Review'::text, 'Waiting Approval'::text]))) not valid;

alter table "public"."action_plans" validate constraint "action_plans_status_check";

alter table "public"."action_plans" add constraint "action_plans_submission_status_check" CHECK (((submission_status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying])::text[]))) not valid;

alter table "public"."action_plans" validate constraint "action_plans_submission_status_check";

alter table "public"."action_plans" add constraint "action_plans_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES public.profiles(id) not valid;

alter table "public"."action_plans" validate constraint "action_plans_submitted_by_fkey";

alter table "public"."action_plans" add constraint "action_plans_unlock_approved_by_fkey" FOREIGN KEY (unlock_approved_by) REFERENCES public.profiles(id) not valid;

alter table "public"."action_plans" validate constraint "action_plans_unlock_approved_by_fkey";

alter table "public"."action_plans" add constraint "action_plans_unlock_requested_by_fkey" FOREIGN KEY (unlock_requested_by) REFERENCES public.profiles(id) not valid;

alter table "public"."action_plans" validate constraint "action_plans_unlock_requested_by_fkey";

alter table "public"."action_plans" add constraint "action_plans_unlock_status_check" CHECK (((unlock_status IS NULL) OR (unlock_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))) not valid;

alter table "public"."action_plans" validate constraint "action_plans_unlock_status_check";

alter table "public"."action_plans" add constraint "carry_over_status_check" CHECK ((carry_over_status = ANY (ARRAY['Normal'::text, 'Late_Month_1'::text, 'Late_Month_2'::text]))) not valid;

alter table "public"."action_plans" validate constraint "carry_over_status_check";

alter table "public"."action_plans" add constraint "department_code_format" CHECK ((department_code = upper(TRIM(BOTH FROM department_code)))) not valid;

alter table "public"."action_plans" validate constraint "department_code_format";

alter table "public"."action_plans" add constraint "max_possible_score_range" CHECK (((max_possible_score >= 0) AND (max_possible_score <= 100))) not valid;

alter table "public"."action_plans" validate constraint "max_possible_score_range";

alter table "public"."action_plans" add constraint "valid_year" CHECK (((year >= 2020) AND (year <= 2100))) not valid;

alter table "public"."action_plans" validate constraint "valid_year";

alter table "public"."audit_logs" add constraint "audit_logs_action_plan_id_fkey" FOREIGN KEY (action_plan_id) REFERENCES public.action_plans(id) ON DELETE CASCADE not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_action_plan_id_fkey";

alter table "public"."audit_logs" add constraint "audit_logs_change_type_check" CHECK ((change_type = ANY (ARRAY['STATUS_UPDATE'::text, 'REMARK_UPDATE'::text, 'OUTCOME_UPDATE'::text, 'FULL_UPDATE'::text, 'CREATED'::text, 'DELETED'::text, 'SOFT_DELETE'::text, 'RESTORE'::text, 'SUBMITTED_FOR_REVIEW'::text, 'MARKED_READY'::text, 'APPROVED'::text, 'REJECTED'::text, 'REVISION_REQUESTED'::text, 'LEADER_BATCH_SUBMIT'::text, 'GRADE_RESET'::text, 'UNLOCK_REQUESTED'::text, 'UNLOCK_APPROVED'::text, 'UNLOCK_REJECTED'::text, 'ALERT_RAISED'::text, 'BLOCKER_UPDATED'::text, 'BLOCKER_REPORTED'::text, 'BLOCKER_CLEARED'::text, 'CARRY_OVER'::text, 'PLAN_DETAILS_UPDATED'::text, 'ALERT_RESOLVED'::text, 'ALERT_CLOSED_FAILED'::text, 'ESCALATION_CHANGE'::text]))) not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_change_type_check";

alter table "public"."audit_logs" add constraint "audit_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."audit_logs" validate constraint "audit_logs_user_id_fkey";

alter table "public"."drop_requests" add constraint "drop_requests_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.action_plans(id) ON DELETE CASCADE not valid;

alter table "public"."drop_requests" validate constraint "drop_requests_plan_id_fkey";

alter table "public"."drop_requests" add constraint "drop_requests_reason_check" CHECK ((length(TRIM(BOTH FROM reason)) >= 5)) not valid;

alter table "public"."drop_requests" validate constraint "drop_requests_reason_check";

alter table "public"."drop_requests" add constraint "drop_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) not valid;

alter table "public"."drop_requests" validate constraint "drop_requests_reviewed_by_fkey";

alter table "public"."drop_requests" add constraint "drop_requests_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text]))) not valid;

alter table "public"."drop_requests" validate constraint "drop_requests_status_check";

alter table "public"."drop_requests" add constraint "drop_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) not valid;

alter table "public"."drop_requests" validate constraint "drop_requests_user_id_fkey";

alter table "public"."dropdown_options" add constraint "dropdown_options_category_label_key" UNIQUE using index "dropdown_options_category_label_key";

alter table "public"."historical_stats" add constraint "historical_stats_completion_rate_check" CHECK (((completion_rate >= (0)::numeric) AND (completion_rate <= (100)::numeric))) not valid;

alter table "public"."historical_stats" validate constraint "historical_stats_completion_rate_check";

alter table "public"."historical_stats" add constraint "historical_stats_department_code_year_month_key" UNIQUE using index "historical_stats_department_code_year_month_key";

alter table "public"."historical_stats" add constraint "historical_stats_month_check" CHECK (((month >= 1) AND (month <= 12))) not valid;

alter table "public"."historical_stats" validate constraint "historical_stats_month_check";

alter table "public"."monthly_lock_schedules" add constraint "monthly_lock_schedules_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) not valid;

alter table "public"."monthly_lock_schedules" validate constraint "monthly_lock_schedules_created_by_fkey";

alter table "public"."monthly_lock_schedules" add constraint "monthly_lock_schedules_month_index_check" CHECK (((month_index >= 0) AND (month_index <= 11))) not valid;

alter table "public"."monthly_lock_schedules" validate constraint "monthly_lock_schedules_month_index_check";

alter table "public"."monthly_lock_schedules" add constraint "monthly_lock_schedules_month_index_year_key" UNIQUE using index "monthly_lock_schedules_month_index_year_key";

alter table "public"."monthly_lock_schedules" add constraint "monthly_lock_schedules_year_check" CHECK (((year >= 2020) AND (year <= 2100))) not valid;

alter table "public"."monthly_lock_schedules" validate constraint "monthly_lock_schedules_year_check";

alter table "public"."notifications" add constraint "notifications_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."notifications" validate constraint "notifications_actor_id_fkey";

alter table "public"."notifications" add constraint "notifications_resource_type_check" CHECK ((resource_type = ANY (ARRAY['ACTION_PLAN'::text, 'COMMENT'::text, 'BLOCKER'::text, 'PROGRESS_LOG'::text]))) not valid;

alter table "public"."notifications" validate constraint "notifications_resource_type_check";

alter table "public"."notifications" add constraint "notifications_type_check" CHECK ((type = ANY (ARRAY['NEW_COMMENT'::text, 'MENTION'::text, 'STATUS_CHANGE'::text, 'KICKBACK'::text, 'BLOCKER_REPORTED'::text, 'BLOCKER_RESOLVED'::text, 'GRADE_RECEIVED'::text, 'UNLOCK_APPROVED'::text, 'UNLOCK_REJECTED'::text, 'UNLOCK_REVOKED'::text, 'TASK_ASSIGNED'::text, 'ESCALATION_LEADER'::text, 'ESCALATION_BOD'::text, 'MANAGEMENT_INSTRUCTION'::text]))) not valid;

alter table "public"."notifications" validate constraint "notifications_type_check";

alter table "public"."notifications" add constraint "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."notifications" validate constraint "notifications_user_id_fkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'leader'::text, 'staff'::text, 'executive'::text, 'Administrator'::text, 'Leader'::text, 'Staff'::text, 'Executive'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_role_check";

alter table "public"."progress_logs" add constraint "progress_logs_action_plan_id_fkey" FOREIGN KEY (action_plan_id) REFERENCES public.action_plans(id) ON DELETE CASCADE not valid;

alter table "public"."progress_logs" validate constraint "progress_logs_action_plan_id_fkey";

alter table "public"."progress_logs" add constraint "progress_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."progress_logs" validate constraint "progress_logs_user_id_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'executive'::text, 'leader'::text, 'staff'::text]))) not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_role_check";

alter table "public"."role_permissions" add constraint "role_permissions_unique" UNIQUE using index "role_permissions_unique";

alter table "public"."system_settings" add constraint "carry_over_penalty_1_range" CHECK (((carry_over_penalty_1 >= 0) AND (carry_over_penalty_1 <= 100))) not valid;

alter table "public"."system_settings" validate constraint "carry_over_penalty_1_range";

alter table "public"."system_settings" add constraint "carry_over_penalty_2_range" CHECK (((carry_over_penalty_2 >= 0) AND (carry_over_penalty_2 <= 100))) not valid;

alter table "public"."system_settings" validate constraint "carry_over_penalty_2_range";

alter table "public"."system_settings" add constraint "chk_threshold_h" CHECK (((threshold_h >= 1) AND (threshold_h <= 100))) not valid;

alter table "public"."system_settings" validate constraint "chk_threshold_h";

alter table "public"."system_settings" add constraint "chk_threshold_l" CHECK (((threshold_l >= 1) AND (threshold_l <= 100))) not valid;

alter table "public"."system_settings" validate constraint "chk_threshold_l";

alter table "public"."system_settings" add constraint "chk_threshold_m" CHECK (((threshold_m >= 1) AND (threshold_m <= 100))) not valid;

alter table "public"."system_settings" validate constraint "chk_threshold_m";

alter table "public"."system_settings" add constraint "chk_threshold_uh" CHECK (((threshold_uh >= 1) AND (threshold_uh <= 100))) not valid;

alter table "public"."system_settings" validate constraint "chk_threshold_uh";

alter table "public"."system_settings" add constraint "standard_passing_score_range" CHECK (((standard_passing_score >= 1) AND (standard_passing_score <= 100))) not valid;

alter table "public"."system_settings" validate constraint "standard_passing_score_range";

alter table "public"."system_settings" add constraint "system_settings_lock_cutoff_day_check" CHECK (((lock_cutoff_day >= 1) AND (lock_cutoff_day <= 28))) not valid;

alter table "public"."system_settings" validate constraint "system_settings_lock_cutoff_day_check";

alter table "public"."system_settings" add constraint "system_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES public.profiles(id) not valid;

alter table "public"."system_settings" validate constraint "system_settings_updated_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.approve_drop_request(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id  UUID := auth.uid();
  v_plan_id   UUID;
  v_reason    TEXT;
  v_req_status TEXT;
BEGIN
  -- Fetch the request
  SELECT plan_id, reason, status
  INTO v_plan_id, v_reason, v_req_status
  FROM drop_requests
  WHERE id = p_request_id;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Drop request not found';
  END IF;
  IF v_req_status <> 'PENDING' THEN
    RAISE EXCEPTION 'This request has already been processed (status: %)', v_req_status;
  END IF;

  -- Verify caller is admin or executive
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND LOWER(role) IN ('admin', 'executive')
  ) THEN
    RAISE EXCEPTION 'Only Admin or Executive can approve drop requests';
  END IF;

  -- 1. Update the drop request
  UPDATE drop_requests
  SET status = 'APPROVED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE id = p_request_id;

  -- 2. Update the action plan: Not Achieved, score 0, clear pending flag
  UPDATE action_plans
  SET status = 'Not Achieved',
      quality_score = 0,
      is_drop_pending = FALSE,
      remark = CASE
        WHEN remark IS NOT NULL AND trim(remark) <> ''
        THEN remark || E'\n[DROPPED via Approval: ' || v_reason || ']'
        ELSE '[DROPPED via Approval: ' || v_reason || ']'
      END
  WHERE id = v_plan_id;

  -- 3. Create notification for the requester
  INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
  SELECT
    dr.user_id,
    'STATUS_CHANGE',
    'Drop Request Approved',
    'Your drop request has been approved. The plan has been marked as Not Achieved.',
    'ACTION_PLAN',
    v_plan_id
  FROM drop_requests dr
  WHERE dr.id = p_request_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_drop_request_v2(p_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id    UUID := auth.uid();
  v_plan        RECORD;
BEGIN
  -- 1. Fetch the plan
  SELECT id, action_plan, gap_analysis, is_drop_pending, department_code, pic, month, year
  INTO v_plan
  FROM action_plans
  WHERE id = p_plan_id;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Action plan not found';
  END IF;

  IF NOT COALESCE(v_plan.is_drop_pending, FALSE) THEN
    RAISE EXCEPTION 'This plan does not have a pending drop request';
  END IF;

  -- 2. Verify caller is admin or executive
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND LOWER(role) IN ('admin', 'executive')
  ) THEN
    RAISE EXCEPTION 'Only Admin or Executive can approve drop requests';
  END IF;

  -- 3. Update the action plan: Not Achieved, score 0, clear pending flag
  UPDATE action_plans
  SET status = 'Not Achieved',
      quality_score = 0,
      is_drop_pending = FALSE,
      resolution_type = 'dropped',
      remark = CASE
        WHEN remark IS NOT NULL AND trim(remark) <> ''
        THEN remark || E'\n[DROPPED via Approval: ' || COALESCE(v_plan.gap_analysis, 'No reason') || ']'
        ELSE '[DROPPED via Approval: ' || COALESCE(v_plan.gap_analysis, 'No reason') || ']'
      END,
      updated_at = NOW()
  WHERE id = p_plan_id;

  -- 4. Also update legacy drop_requests if any exist for this plan
  UPDATE drop_requests
  SET status = 'APPROVED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE plan_id = p_plan_id
    AND status = 'PENDING';

  -- 5. Audit log
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, v_admin_id, 'STATUS_CHANGE',
    '"Not Achieved (Pending Drop)"',
    '"Not Achieved (Dropped)"',
    'Drop request approved. Plan marked as Not Achieved with score 0.'
  );
END;
$function$
;

create or replace view "public"."audit_logs_with_user" as  SELECT al.id,
    al.action_plan_id,
    al.user_id,
    al.change_type,
    al.previous_value,
    al.new_value,
    al.description,
    al.created_at,
    p.full_name AS user_name,
    p.department_code AS user_department,
    p.role AS user_role
   FROM (public.audit_logs al
     LEFT JOIN public.profiles p ON ((al.user_id = p.id)));


CREATE OR REPLACE FUNCTION public.auto_cancel_drop_requests_on_finalization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_final_statuses TEXT[] := ARRAY['Achieved', 'Not Achieved'];
  v_cancelled_count INT;
BEGIN
  -- Only act when the status actually changed to a final state
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = ANY(v_final_statuses)
  THEN

    -- Cancel all PENDING drop requests for this plan
    WITH cancelled AS (
      UPDATE drop_requests
      SET status      = 'CANCELLED',
          reviewed_at = NOW(),
          -- Append a system note to the reason so auditors know what happened
          reason      = reason
                        || E'\n[System: Auto-cancelled — plan status updated to "'
                        || NEW.status || '"]'
      WHERE plan_id = NEW.id
        AND status  = 'PENDING'
      RETURNING id, user_id
    )
    -- Notify each requester that their request was auto-cancelled
    INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
    SELECT
      c.user_id,
      'STATUS_CHANGE',
      'Drop Request Auto-Cancelled',
      'Your drop request was automatically cancelled because the plan was marked as "' || NEW.status || '".',
      'ACTION_PLAN',
      NEW.id
    FROM cancelled c;

    -- Read how many were cancelled (for logging / the flag clear below)
    GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

    -- Clear the is_drop_pending flag if any requests were cancelled
    -- (This UPDATE fires WITHIN the same trigger transaction, 
    --  but since the flag is on the same row we're already updating
    --  we can set it directly on NEW instead.)
    IF v_cancelled_count > 0 AND NEW.is_drop_pending = TRUE THEN
      NEW.is_drop_pending := FALSE;
    END IF;

  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.carry_over_plan(p_plan_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan record;
  v_penalty_1 integer;
  v_penalty_2 integer;
  v_new_max integer;
  v_new_status text;
  v_next_month text;
  v_next_year integer;
  v_new_plan_id uuid;
  v_month_order text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  v_month_idx integer;
BEGIN
  -- 1. Fetch penalty settings
  SELECT carry_over_penalty_1, carry_over_penalty_2
    INTO v_penalty_1, v_penalty_2
    FROM system_settings
    WHERE id = 1;

  IF v_penalty_1 IS NULL THEN
    v_penalty_1 := 80;
    v_penalty_2 := 50;
  END IF;

  -- 2. Fetch the plan
  SELECT * INTO v_plan FROM action_plans WHERE id = p_plan_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  -- 3. Calculate next month
  v_month_idx := array_position(v_month_order, v_plan.month);
  IF v_month_idx IS NULL THEN
    RAISE EXCEPTION 'Invalid month: %', v_plan.month;
  END IF;

  IF v_month_idx = 12 THEN
    v_next_month := 'Jan';
    v_next_year := v_plan.year + 1;
  ELSE
    v_next_month := v_month_order[v_month_idx + 1];
    v_next_year := v_plan.year;
  END IF;

  -- 4. Validate carry-over limit
  IF v_plan.carry_over_status = 'Late_Month_2' THEN
    RAISE EXCEPTION 'This plan has already been carried over twice. It cannot be carried over again.';
  END IF;

  -- 5. Determine new carry-over status and max score
  IF COALESCE(v_plan.carry_over_status, 'Normal') = 'Normal' THEN
    v_new_status := 'Late_Month_1';
    v_new_max := v_penalty_1;
  ELSIF v_plan.carry_over_status = 'Late_Month_1' THEN
    v_new_status := 'Late_Month_2';
    v_new_max := v_penalty_2;
  ELSE
     -- Should be caught by step 4, but safe fallback
     v_new_status := 'Late_Month_2';
     v_new_max := v_penalty_2;
  END IF;

  -- 6. Create carried-over duplicate for next month
  INSERT INTO action_plans (
    department_code, year, month,
    goal_strategy, action_plan, indicator, pic,
    report_format, area_focus, category, evidence,
    status, carry_over_status, origin_plan_id, max_possible_score,
    is_carry_over, created_at, updated_at
  ) VALUES (
    v_plan.department_code, v_next_year, v_next_month,
    v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic,
    v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
    'Open', v_new_status, p_plan_id, v_new_max,
    true, now(), now()
  ) RETURNING id INTO v_new_plan_id;

  -- 7. Audit log for the original plan
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, p_user_id, 'CARRY_OVER',
    jsonb_build_object('status', v_plan.status, 'carry_over_status', v_plan.carry_over_status),
    jsonb_build_object('status', 'Not Achieved', 'carried_to_plan_id', v_new_plan_id, 'carried_to_month', v_next_month, 'max_possible_score', v_new_max),
    format('Carried over to %s %s (max score: %s%%).', v_next_month, v_next_year, v_new_max)
  );

  -- 8. Audit log for the new plan
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    v_new_plan_id, p_user_id, 'CREATED',
    NULL,
    jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', p_plan_id, 'max_possible_score', v_new_max),
    format('Created via carry-over from %s %s. Max achievable score: %s%%.', v_plan.month, v_plan.year, v_new_max)
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_plan_id', v_new_plan_id,
    'next_month', v_next_month,
    'next_year', v_next_year,
    'max_possible_score', v_new_max
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.clamp_quality_score()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only act when quality_score is being set and max_possible_score exists
  IF NEW.quality_score IS NOT NULL AND NEW.max_possible_score IS NOT NULL AND NEW.max_possible_score < 100 THEN
    IF NEW.quality_score > NEW.max_possible_score THEN
      NEW.quality_score := NEW.max_possible_score;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_notification(p_user_id uuid, p_actor_id uuid, p_resource_id uuid, p_resource_type text, p_type text, p_title text DEFAULT NULL::text, p_message text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_notification_id UUID;
BEGIN
  -- Don't notify yourself
  IF p_user_id = p_actor_id THEN
    RETURN NULL;
  END IF;
  
  INSERT INTO notifications (user_id, actor_id, resource_id, resource_type, type, title, message)
  VALUES (p_user_id, p_actor_id, p_resource_id, p_resource_type, p_type, p_title, p_message)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_carry_over_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'carry_over_penalty_1', COALESCE(carry_over_penalty_1, 80),
    'carry_over_penalty_2', COALESCE(carry_over_penalty_2, 50)
  ) INTO v_result
  FROM system_settings
  WHERE id = 1;

  IF v_result IS NULL THEN
    v_result := jsonb_build_object('carry_over_penalty_1', 80, 'carry_over_penalty_2', 50);
  END IF;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.grade_action_plan(p_plan_id uuid, p_input_score integer, p_status text DEFAULT 'Achieved'::text, p_admin_feedback text DEFAULT NULL::text, p_reviewed_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_strict           boolean;
  v_threshold_uh     integer;
  v_threshold_h      integer;
  v_threshold_m      integer;
  v_threshold_l      integer;
  v_category         text;
  v_max_score        integer;
  v_submission_status text;
  v_selected_threshold integer;
  v_passing_target   integer;
  v_final_status     text;
  v_final_score      integer;
BEGIN
  -- 1. Fetch settings
  SELECT is_strict_grading_enabled, threshold_uh, threshold_h, threshold_m, threshold_l
  INTO v_strict, v_threshold_uh, v_threshold_h, v_threshold_m, v_threshold_l
  FROM public.system_settings
  WHERE id = 1;

  -- 2. Fetch plan data with race-condition guard
  SELECT category, max_possible_score, submission_status
  INTO v_category, v_max_score, v_submission_status
  FROM public.action_plans
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id;
  END IF;

  IF v_submission_status <> 'submitted' THEN
    RAISE EXCEPTION 'Plan is not in submitted status (may have been recalled)';
  END IF;

  -- Default max score
  IF v_max_score IS NULL OR v_max_score <= 0 THEN
    v_max_score := 100;
  END IF;

  -- Clamp input score
  v_final_score := LEAST(p_input_score, v_max_score);

  -- 3. Determine status
  IF v_strict THEN
    -- Select threshold based on category
    DECLARE
      v_cat_upper text := UPPER(COALESCE(v_category, ''));
    BEGIN
      IF v_cat_upper LIKE 'UH%' OR v_cat_upper LIKE 'ULTRA%' THEN
        v_selected_threshold := v_threshold_uh;
      ELSIF v_cat_upper LIKE 'H%' OR v_cat_upper = 'HIGH' THEN
        v_selected_threshold := v_threshold_h;
      ELSIF v_cat_upper LIKE 'M%' OR v_cat_upper = 'MEDIUM' THEN
        v_selected_threshold := v_threshold_m;
      ELSIF v_cat_upper LIKE 'L%' OR v_cat_upper = 'LOW' THEN
        v_selected_threshold := v_threshold_l;
      ELSE
        -- Unknown category: fall back to medium threshold
        v_selected_threshold := v_threshold_m;
      END IF;
    END;

    -- Fairness: cap threshold at plan's max possible score
    v_passing_target := LEAST(v_selected_threshold, v_max_score);

    IF v_final_score >= v_passing_target THEN
      v_final_status := 'Achieved';
    ELSE
      v_final_status := 'Not Achieved';
    END IF;
  ELSE
    -- Flexible mode: respect admin's decision
    v_final_status := p_status;
  END IF;

  -- 4. Update the plan
  UPDATE public.action_plans
  SET quality_score    = v_final_score,
      status           = v_final_status,
      admin_feedback   = p_admin_feedback,
      reviewed_by      = p_reviewed_by,
      reviewed_at      = now(),
      updated_at       = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'final_status', v_final_status,
    'final_score', v_final_score,
    'passing_target', v_passing_target,
    'strict_mode', v_strict,
    'selected_threshold', v_selected_threshold
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, department_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff'),
    NEW.raw_user_meta_data->>'department_code'
  );
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_action_plan_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id UUID;
  v_change_type TEXT;
  v_description TEXT;
  v_prev_value JSONB;
  v_new_value JSONB;
  log_details TEXT := '';
BEGIN
  -- Get current user ID from auth context
  v_user_id := auth.uid();
  
  -- ========================================
  -- HANDLE INSERT (New Record Created)
  -- ========================================
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_carry_over = TRUE THEN
      v_change_type := 'CARRY_OVER';
      v_description := format('⏭️ CARRY OVER: Plan carried from previous month to %s %s', NEW.month, NEW.year);
    ELSE
      v_change_type := 'CREATED';
      v_description := format('➕ Created new action plan for %s', NEW.month);
    END IF;
    
    v_prev_value := NULL;
    v_new_value := jsonb_build_object(
      'status', NEW.status,
      'month', NEW.month,
      'year', NEW.year,
      'action_plan', NEW.action_plan,
      'goal_strategy', NEW.goal_strategy,
      'is_carry_over', NEW.is_carry_over
    );
    
    INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
    
    RETURN NEW;
  END IF;
  
  -- ========================================
  -- HANDLE UPDATE (Existing Record Modified)
  -- ========================================
  IF TG_OP = 'UPDATE' THEN
    -- Build previous and new value objects with ALL relevant fields (now including month/year)
    v_prev_value := jsonb_build_object(
      'status', OLD.status,
      'month', OLD.month,
      'year', OLD.year,
      'is_blocked', OLD.is_blocked,
      'blocker_reason', OLD.blocker_reason,
      'action_plan', OLD.action_plan,
      'goal_strategy', OLD.goal_strategy,
      'remark', OLD.remark,
      'outcome_link', OLD.outcome_link,
      'evidence', OLD.evidence,
      'quality_score', OLD.quality_score,
      'submission_status', OLD.submission_status,
      'unlock_status', OLD.unlock_status,
      'gap_category', OLD.gap_category,
      'gap_analysis', OLD.gap_analysis,
      'specify_reason', OLD.specify_reason,
      'attention_level', OLD.attention_level,
      'blocker_category', OLD.blocker_category
    );
    
    v_new_value := jsonb_build_object(
      'status', NEW.status,
      'month', NEW.month,
      'year', NEW.year,
      'is_blocked', NEW.is_blocked,
      'blocker_reason', NEW.blocker_reason,
      'action_plan', NEW.action_plan,
      'goal_strategy', NEW.goal_strategy,
      'remark', NEW.remark,
      'outcome_link', NEW.outcome_link,
      'evidence', NEW.evidence,
      'quality_score', NEW.quality_score,
      'submission_status', NEW.submission_status,
      'unlock_status', NEW.unlock_status,
      'gap_category', NEW.gap_category,
      'gap_analysis', NEW.gap_analysis,
      'specify_reason', NEW.specify_reason,
      'attention_level', NEW.attention_level,
      'blocker_category', NEW.blocker_category
    );
    
    -- ========================================
    -- ESCALATION CHANGE (Non-returning, fires before priority checks)
    -- ========================================
    IF OLD.attention_level IS DISTINCT FROM NEW.attention_level THEN
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (
        NEW.id,
        v_user_id,
        'ESCALATION_CHANGE',
        jsonb_build_object('attention_level', OLD.attention_level),
        jsonb_build_object('attention_level', NEW.attention_level),
        CASE NEW.attention_level
          WHEN 'Leader' THEN '⚠️ Escalated to Department Leader'
          WHEN 'Management_BOD' THEN '🔥 Escalated to Top Management/BOD'
          WHEN 'Standard' THEN '⬇️ De-escalated to standard handling'
        END
      );
      -- NOTE: No RETURN NEW here — fall through to other checks
    END IF;
    
    -- ========================================
    -- PRIORITY 1: Leader Escalates to Management (Alert Status)
    -- ========================================
    IF NEW.status = 'Alert' AND (OLD.status IS DISTINCT FROM 'Alert') THEN
      v_change_type := 'ALERT_RAISED';
      v_description := format('⚠️ ESCALATED TO MANAGEMENT: %s', 
        COALESCE(LEFT(NEW.blocker_reason, 100), 'Issue requires management attention'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 2: Staff Reports Blocker (Internal)
    -- ========================================
    IF NEW.is_blocked = TRUE AND (OLD.is_blocked IS DISTINCT FROM TRUE) THEN
      v_change_type := 'BLOCKER_REPORTED';
      v_description := format('⛔ BLOCKER REPORTED: %s', 
        COALESCE(LEFT(NEW.blocker_reason, 100), 'Issue blocking progress'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 3: Blocker Cleared (Resolved Internally)
    -- ========================================
    IF NEW.is_blocked = FALSE AND OLD.is_blocked = TRUE THEN
      v_change_type := 'BLOCKER_CLEARED';
      v_description := '✅ BLOCKER CLEARED: Issue marked as resolved.';
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 4: Escalation Reason Updated (while in Alert)
    -- ========================================
    IF NEW.status = 'Alert' AND OLD.status = 'Alert' 
       AND (OLD.blocker_reason IS DISTINCT FROM NEW.blocker_reason) THEN
      v_change_type := 'BLOCKER_UPDATED';
      v_description := format('✏️ Updated escalation details: "%s"', 
        COALESCE(LEFT(NEW.blocker_reason, 100), 'Cleared'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 5: Status Change (including Not Achieved with RCA)
    -- ========================================
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_change_type := 'STATUS_UPDATE';
      
      IF NEW.status = 'Not Achieved' THEN
        v_description := format('Status: %s → %s | Root Cause: %s', 
          COALESCE(OLD.status, 'None'),
          NEW.status,
          COALESCE(
            CASE WHEN NEW.gap_category = 'Other' AND NEW.specify_reason IS NOT NULL 
                 THEN 'Other: ' || LEFT(NEW.specify_reason, 50)
                 ELSE NEW.gap_category
            END,
            'Not specified'
          )
        );
      ELSE
        v_description := format('Status: %s → %s', 
          COALESCE(OLD.status, 'None'),
          NEW.status);
      END IF;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 5.5: Month/Year Change (Rescheduled)
    -- ========================================
    IF (OLD.month IS DISTINCT FROM NEW.month) OR (OLD.year IS DISTINCT FROM NEW.year) THEN
      v_change_type := 'RESCHEDULED';
      
      IF OLD.year IS DISTINCT FROM NEW.year THEN
        -- Both month and year changed (e.g. Dec 2025 → Jan 2026)
        v_description := format('📅 Rescheduled: %s %s → %s %s',
          COALESCE(OLD.month, '?'), COALESCE(OLD.year::TEXT, '?'),
          COALESCE(NEW.month, '?'), COALESCE(NEW.year::TEXT, '?'));
      ELSE
        -- Only month changed within the same year
        v_description := format('📅 Rescheduled: %s → %s (%s)',
          COALESCE(OLD.month, '?'),
          COALESCE(NEW.month, '?'),
          COALESCE(NEW.year::TEXT, '?'));
      END IF;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 6: Unlock Status Changes
    -- ========================================
    IF OLD.unlock_status IS DISTINCT FROM NEW.unlock_status THEN
      IF NEW.unlock_status = 'pending' THEN
        v_change_type := 'UNLOCK_REQUESTED';
        v_description := format('🔓 Unlock requested: %s', COALESCE(LEFT(NEW.unlock_reason, 100), 'No reason provided'));
      ELSIF NEW.unlock_status = 'approved' THEN
        v_change_type := 'UNLOCK_APPROVED';
        v_description := '✅ Unlock request approved';
      ELSIF NEW.unlock_status = 'rejected' THEN
        v_change_type := 'UNLOCK_REJECTED';
        v_description := format('❌ Unlock request rejected: %s', COALESCE(LEFT(NEW.unlock_rejection_reason, 100), 'No reason provided'));
      ELSE
        v_change_type := 'UNLOCK_REQUESTED';
        v_description := 'Unlock status changed';
      END IF;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 7: Submission Status Changes
    -- ========================================
    IF OLD.submission_status IS DISTINCT FROM NEW.submission_status THEN
      IF NEW.submission_status = 'submitted' THEN
        v_change_type := 'SUBMITTED_FOR_REVIEW';
        v_description := '📤 Submitted for admin review';
      ELSE
        v_change_type := 'STATUS_UPDATE';
        v_description := format('Submission status: %s → %s', 
          COALESCE(OLD.submission_status, 'draft'),
          COALESCE(NEW.submission_status, 'draft'));
      END IF;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 8: Grade/Score Changes
    -- ========================================
    IF OLD.quality_score IS DISTINCT FROM NEW.quality_score THEN
      IF NEW.quality_score IS NULL AND OLD.quality_score IS NOT NULL THEN
        v_change_type := 'GRADE_RESET';
        v_description := format('🔄 Grade reset (was %s%%)', OLD.quality_score);
      ELSE
        v_change_type := 'APPROVED';
        v_description := format('✅ Graded: %s%%', NEW.quality_score);
      END IF;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 9: Evidence/Outcome Changes
    -- ========================================
    IF (OLD.outcome_link IS DISTINCT FROM NEW.outcome_link) OR 
       (OLD.evidence IS DISTINCT FROM NEW.evidence) THEN
      v_change_type := 'OUTCOME_UPDATE';
      log_details := '';
      
      IF OLD.outcome_link IS DISTINCT FROM NEW.outcome_link THEN
        log_details := log_details || format('Proof of Evidence: %s', COALESCE(LEFT(NEW.outcome_link, 50), 'Cleared'));
      END IF;
      
      IF OLD.evidence IS DISTINCT FROM NEW.evidence THEN
        IF log_details != '' THEN log_details := log_details || ' | '; END IF;
        log_details := log_details || format('Evidence: %s', COALESCE(LEFT(NEW.evidence, 50), 'Cleared'));
      END IF;
      
      v_description := '🔗 ' || log_details;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 10: Remark Changes
    -- ========================================
    IF OLD.remark IS DISTINCT FROM NEW.remark THEN
      v_change_type := 'REMARK_UPDATE';
      v_description := format('📝 Remark: %s', COALESCE(LEFT(NEW.remark, 100), 'Cleared'));
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
    -- ========================================
    -- PRIORITY 11: Plan Details Changes
    -- ========================================
    IF (OLD.action_plan IS DISTINCT FROM NEW.action_plan) OR
       (OLD.goal_strategy IS DISTINCT FROM NEW.goal_strategy) THEN
      v_change_type := 'PLAN_DETAILS_UPDATED';
      log_details := '';
      
      IF OLD.action_plan IS DISTINCT FROM NEW.action_plan THEN
        log_details := 'Action Plan updated';
      END IF;
      
      IF OLD.goal_strategy IS DISTINCT FROM NEW.goal_strategy THEN
        IF log_details != '' THEN log_details := log_details || ', '; END IF;
        log_details := log_details || 'Goal/Strategy updated';
      END IF;
      
      v_description := '✏️ ' || log_details;
      
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (NEW.id, v_user_id, v_change_type, v_prev_value, v_new_value, v_description);
      
      RETURN NEW;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor_id uuid;
  _actor_name text;
  _recipient RECORD;
  _notif_type text;
  _title text;
  _message text;
BEGIN
  -- Only fire on attention_level changes
  IF OLD.attention_level IS NOT DISTINCT FROM NEW.attention_level THEN
    RETURN NEW;
  END IF;

  -- Only fire for Leader or Management_BOD escalations
  IF NEW.attention_level NOT IN ('Leader', 'Management_BOD') THEN
    RETURN NEW;
  END IF;

  -- Get the actor (the user who made the change)
  _actor_id := auth.uid();

  SELECT full_name INTO _actor_name
  FROM profiles
  WHERE id = _actor_id;

  IF NEW.attention_level = 'Leader' THEN
    _notif_type := 'ESCALATION_LEADER';
    _title := 'Action Required';
    _message := COALESCE(_actor_name, 'A team member') || ' requested Leader Attention on: ' || COALESCE(NEW.action_plan, 'an action plan');

    -- Notify all leaders for this department
    FOR _recipient IN
      SELECT id FROM profiles
      WHERE role IN ('leader', 'dept_head')
        AND (department_code = NEW.department_code OR NEW.department_code = ANY(additional_departments))
        AND id IS DISTINCT FROM _actor_id
    LOOP
      INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id, actor_id, is_read)
      VALUES (_recipient.id, _notif_type, _title, _message, 'ACTION_PLAN', NEW.id, _actor_id, false);
    END LOOP;

  ELSIF NEW.attention_level = 'Management_BOD' THEN
    _notif_type := 'ESCALATION_BOD';
    _title := 'Critical Escalation';
    _message := 'Action plan flagged for BOD Attention: ' || COALESCE(NEW.action_plan, 'an action plan');

    -- Notify all admins AND executives
    FOR _recipient IN
      SELECT id FROM profiles
      WHERE role IN ('admin', 'executive')
        AND id IS DISTINCT FROM _actor_id
    LOOP
      INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id, actor_id, is_read)
      VALUES (_recipient.id, _notif_type, _title, _message, 'ACTION_PLAN', NEW.id, _actor_id, false);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_plan_owner_id UUID;
  v_leader_id UUID;
  v_actor_id UUID;
  v_title TEXT;
  v_message TEXT;
BEGIN
  -- Get the current user (actor)
  v_actor_id := auth.uid();
  
  -- Get the plan owner (PIC) from profiles by matching full_name
  SELECT p.id INTO v_plan_owner_id
  FROM profiles p
  WHERE LOWER(p.full_name) = LOWER(NEW.pic)
  LIMIT 1;
  
  -- Get the department leader
  SELECT p.id INTO v_leader_id
  FROM profiles p
  WHERE p.department_code = NEW.department_code
    AND p.role IN ('leader', 'dept_head')
  LIMIT 1;
  
  -- Notify on status change to "Not Achieved" (Kickback)
  IF NEW.status = 'Not Achieved' AND OLD.status IS DISTINCT FROM 'Not Achieved' THEN
    v_title := 'Task Marked as Not Achieved';
    v_message := format('Action plan "%s" was marked as Not Achieved.', LEFT(NEW.action_plan, 50));
    
    -- Notify the PIC (plan owner)
    IF v_plan_owner_id IS NOT NULL THEN
      PERFORM create_notification(
        v_plan_owner_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'KICKBACK',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  -- Notify on blocker reported (Staff -> Leader)
  IF NEW.is_blocked = TRUE AND (OLD.is_blocked IS DISTINCT FROM TRUE) THEN
    v_title := 'New Blocker Reported';
    v_message := format('Blocker reported on "%s": %s', LEFT(NEW.action_plan, 30), LEFT(NEW.blocker_reason, 50));
    
    -- Notify the department leader
    IF v_leader_id IS NOT NULL THEN
      PERFORM create_notification(
        v_leader_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'BLOCKER_REPORTED',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  -- Notify on blocker resolved (Leader -> PIC)
  IF NEW.is_blocked = FALSE AND OLD.is_blocked = TRUE THEN
    v_title := 'Blocker Resolved';
    v_message := format('Blocker on "%s" has been resolved.', LEFT(NEW.action_plan, 50));
    
    -- Notify the PIC
    IF v_plan_owner_id IS NOT NULL THEN
      PERFORM create_notification(
        v_plan_owner_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'BLOCKER_RESOLVED',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  -- Notify on grade received (Admin -> PIC)
  IF NEW.quality_score IS NOT NULL AND OLD.quality_score IS NULL THEN
    v_title := 'Grade Received';
    v_message := format('Your action plan "%s" received a score of %s%%.', LEFT(NEW.action_plan, 40), NEW.quality_score);
    
    -- Notify the PIC
    IF v_plan_owner_id IS NOT NULL THEN
      PERFORM create_notification(
        v_plan_owner_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'GRADE_RECEIVED',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  -- Notify on unlock approved (Admin -> Leader)
  IF NEW.unlock_status = 'approved' AND OLD.unlock_status = 'pending' THEN
    v_title := 'Unlock Request Approved';
    v_message := format('Your unlock request for "%s" has been approved.', LEFT(NEW.action_plan, 50));
    
    -- Notify the leader who requested
    IF v_leader_id IS NOT NULL THEN
      PERFORM create_notification(
        v_leader_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'UNLOCK_APPROVED',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  -- Notify on unlock rejected (Admin -> Leader)
  IF NEW.unlock_status = 'rejected' AND OLD.unlock_status = 'pending' THEN
    v_title := 'Unlock Request Rejected';
    v_message := format('Your unlock request for "%s" was rejected: %s', LEFT(NEW.action_plan, 40), LEFT(NEW.unlock_rejection_reason, 50));
    
    -- Notify the leader who requested
    IF v_leader_id IS NOT NULL THEN
      PERFORM create_notification(
        v_leader_id,
        v_actor_id,
        NEW.id,
        'ACTION_PLAN',
        'UNLOCK_REJECTED',
        v_title,
        v_message
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pic_user_id uuid;
  v_actor_name text;
  v_current_user_id uuid;
BEGIN
  -- Get the current user ID
  v_current_user_id := auth.uid();
  
  -- Only proceed if status actually changed
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Find the PIC's user ID by matching full_name in profiles
  -- Also check department match for accuracy
  SELECT id INTO v_pic_user_id
  FROM profiles
  WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(NEW.pic))
    AND (
      department_code = NEW.department_code
      OR NEW.department_code = ANY(additional_departments)
    )
  LIMIT 1;
  
  -- If no exact match with department, try just by name
  IF v_pic_user_id IS NULL THEN
    SELECT id INTO v_pic_user_id
    FROM profiles
    WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(NEW.pic))
    LIMIT 1;
  END IF;
  
  -- If PIC not found in profiles, skip notification
  IF v_pic_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Don't notify if the user is updating their own plan
  IF v_current_user_id IS NOT NULL AND v_current_user_id = v_pic_user_id THEN
    RETURN NEW;
  END IF;
  
  -- Get the actor's name for the notification message
  SELECT full_name INTO v_actor_name
  FROM profiles
  WHERE id = v_current_user_id;
  
  -- Default to 'Someone' if actor not found
  IF v_actor_name IS NULL THEN
    v_actor_name := 'Someone';
  END IF;
  
  -- Insert notification for the PIC
  INSERT INTO notifications (
    user_id,
    actor_id,
    resource_id,
    resource_type,
    type,
    title,
    message,
    is_read,
    created_at
  ) VALUES (
    v_pic_user_id,
    v_current_user_id,
    NEW.id,
    'ACTION_PLAN',
    'STATUS_CHANGE',
    'Status Updated',
    v_actor_name || ' changed your action plan status from "' || COALESCE(OLD.status, 'Open') || '" to "' || NEW.status || '"',
    false,
    now()
  );
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.process_unlock_request(p_plan_id uuid, p_action text, p_admin_id uuid, p_expiry_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_rejection_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan record;
  v_action_upper text;
  v_requester_id uuid;
  v_expiry_text text;
BEGIN
  v_action_upper := UPPER(TRIM(p_action));

  IF v_action_upper NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Invalid action: %. Must be APPROVE or REJECT.', p_action;
  END IF;

  SELECT id, unlock_status, action_plan, unlock_requested_by
  INTO v_plan
  FROM public.action_plans
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id;
  END IF;

  IF v_plan.unlock_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'Plan does not have a pending unlock request (current status: %)', COALESCE(v_plan.unlock_status, 'none');
  END IF;

  v_requester_id := v_plan.unlock_requested_by;

  IF v_action_upper = 'APPROVE' THEN
    UPDATE public.action_plans
    SET unlock_status       = 'approved',
        unlock_approved_by  = p_admin_id,
        unlock_approved_at  = now(),
        approved_until      = p_expiry_date,
        updated_at          = now()
    WHERE id = p_plan_id;

    IF v_requester_id IS NOT NULL THEN
      v_expiry_text := CASE
        WHEN p_expiry_date IS NOT NULL THEN to_char(p_expiry_date AT TIME ZONE 'Asia/Jakarta', 'DD Mon HH24:MI')
        ELSE 'no deadline'
      END;

      INSERT INTO public.notifications (user_id, actor_id, resource_id, resource_type, type, title, message)
      VALUES (
        v_requester_id,
        p_admin_id,
        p_plan_id,
        'ACTION_PLAN',
        'UNLOCK_APPROVED',
        'Unlock Request Approved',
        format('Your plan is temporarily unlocked. Access expires on %s. Please update and submit immediately.', v_expiry_text)
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'APPROVED',
      'plan_id', p_plan_id,
      'expiry_date', p_expiry_date
    );

  ELSIF v_action_upper = 'REJECT' THEN
    UPDATE public.action_plans
    SET unlock_status            = 'rejected',
        unlock_approved_by       = p_admin_id,
        unlock_approved_at       = now(),
        unlock_rejection_reason  = COALESCE(p_rejection_reason, ''),
        approved_until           = NULL,
        updated_at               = now()
    WHERE id = p_plan_id;

    IF v_requester_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, actor_id, resource_id, resource_type, type, title, message)
      VALUES (
        v_requester_id,
        p_admin_id,
        p_plan_id,
        'ACTION_PLAN',
        'UNLOCK_REJECTED',
        'Unlock Request Rejected',
        'Admin denied your unlock request. Please resolve this item via the Outstanding Resolution Wizard (Carry Over/Drop).'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'REJECTED',
      'plan_id', p_plan_id,
      'rejection_reason', COALESCE(p_rejection_reason, '')
    );
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'Unknown action');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_drop_request(p_request_id uuid, p_rejection_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id       UUID := auth.uid();
  v_plan_id        UUID;
  v_req_status     TEXT;
  v_plan           RECORD;
  v_report_status  TEXT;
  v_month_order    TEXT[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  v_month_idx      INTEGER;
  v_next_month     TEXT;
  v_next_year      INTEGER;
  v_penalty_1      INTEGER;
  v_penalty_2      INTEGER;
  v_new_max        INTEGER;
  v_new_status     TEXT;
  v_new_plan_id    UUID;
BEGIN
  -- 1. Fetch the request
  SELECT plan_id, status
  INTO v_plan_id, v_req_status
  FROM drop_requests
  WHERE id = p_request_id;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Drop request not found';
  END IF;
  IF v_req_status <> 'PENDING' THEN
    RAISE EXCEPTION 'This request has already been processed (status: %)', v_req_status;
  END IF;

  -- 2. Verify caller is admin or executive
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND LOWER(role) IN ('admin', 'executive')
  ) THEN
    RAISE EXCEPTION 'Only Admin or Executive can reject drop requests';
  END IF;

  -- 3. Fetch plan details
  SELECT * INTO v_plan FROM action_plans WHERE id = v_plan_id;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Action plan not found';
  END IF;

  -- 4. Determine Report Status (Submission Status)
  -- If submission_status is 'submitted', the report is closed.
  v_report_status := COALESCE(v_plan.submission_status, 'draft');

  -- 5. Update the drop request status
  UPDATE drop_requests
  SET status = 'REJECTED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE id = p_request_id;

  -- 6. Branch Logic
  IF v_report_status = 'submitted' THEN
    -- BRANCH A: Report is CLOSED (Submitted)
    -- Must Auto-Carry Over to Next Month

    -- A1. Calculate Next Month
    v_month_idx := array_position(v_month_order, v_plan.month);
    IF v_month_idx IS NULL THEN
      RAISE EXCEPTION 'Invalid month in plan: %', v_plan.month;
    END IF;

    IF v_month_idx = 12 THEN
      v_next_month := 'Jan';
      v_next_year := v_plan.year + 1;
    ELSE
      v_next_month := v_month_order[v_month_idx + 1];
      v_next_year := v_plan.year;
    END IF;

    -- A2. Fetch Penalty Settings
    SELECT carry_over_penalty_1, carry_over_penalty_2
    INTO v_penalty_1, v_penalty_2
    FROM system_settings
    WHERE id = 1;

    -- Defaults if null
    IF v_penalty_1 IS NULL THEN v_penalty_1 := 80; END IF;
    IF v_penalty_2 IS NULL THEN v_penalty_2 := 50; END IF;

    -- A3. Determine New Status & Max Score
    IF COALESCE(v_plan.carry_over_status, 'Normal') = 'Normal' THEN
      v_new_status := 'Late_Month_1';
      v_new_max := v_penalty_1;
    ELSIF v_plan.carry_over_status = 'Late_Month_1' THEN
      v_new_status := 'Late_Month_2';
      v_new_max := v_penalty_2;
    ELSE
      -- Already Late_Month_2 or beyond. 
      -- Strict logic: Should probably be dropped, but we are rejecting a drop.
      -- Fallback: Carry over as Late_Month_2 again (max 50) or capped at min?
      -- Let's stick to Late_Month_2 for now.
      v_new_status := 'Late_Month_2';
      v_new_max := v_penalty_2;
    END IF;

    -- A4. Update Current Plan (Fail it)
    UPDATE action_plans
    SET status = 'Not Achieved',
        quality_score = 0,
        is_drop_pending = FALSE,
        remark = CASE
          WHEN remark IS NOT NULL AND trim(remark) <> '' THEN remark || E'\n[Drop Rejected & Auto-Carried Over: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
          ELSE '[Drop Rejected & Auto-Carried Over: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
        END
    WHERE id = v_plan_id;

    -- A5. Create New Plan (Carry Over)
    INSERT INTO action_plans (
      department_code, year, month,
      goal_strategy, action_plan, indicator, pic,
      report_format, area_focus, category, evidence,
      status, carry_over_status, origin_plan_id, max_possible_score,
      is_carry_over, created_at, updated_at
    ) VALUES (
      v_plan.department_code, v_next_year, v_next_month,
      v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic,
      v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
      'Open', v_new_status, v_plan_id, v_new_max,
      true, now(), now()
    ) RETURNING id INTO v_new_plan_id;

    -- A6. Notification (Auto-Carry Over)
    INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
    SELECT
      dr.user_id,
      'STATUS_CHANGE',
      'Drop Request Rejected & Carried Over',
      'Drop Request Rejected. Since the report is closed, this plan has been automatically carried over to ' || v_next_month || ' ' || v_next_year || '. Reason: ' || COALESCE(p_rejection_reason, 'Management decision'),
      'ACTION_PLAN',
      v_new_plan_id
    FROM drop_requests dr
    WHERE dr.id = p_request_id;

    -- A7. Audit Log for Creation
    INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (
      v_new_plan_id, v_admin_id, 'CREATED',
      NULL,
      jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', v_plan_id, 'max_possible_score', v_new_max),
      format('Auto-carried over due to Drop Rejection on submitted report (%s %s). Next Month: %s %s', v_plan.month, v_plan.year, v_next_month, v_next_year)
    );

  ELSE
    -- BRANCH B: Report is OPEN (Draft)
    -- Just restore to Open
    
    UPDATE action_plans
    SET status = 'Open',
        is_drop_pending = FALSE,
        remark = CASE
          WHEN remark IS NOT NULL AND trim(remark) <> '' THEN remark || E'\n[Drop Rejected: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
          ELSE '[Drop Rejected: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
        END
    WHERE id = v_plan_id;

    -- Notification (Simple Rejection)
    INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
    SELECT
      dr.user_id,
      'STATUS_CHANGE',
      'Drop Request Rejected',
      'Drop Rejected. Please resume work. Reason: ' || COALESCE(p_rejection_reason, 'Management decision'),
      'ACTION_PLAN',
      v_plan_id
    FROM drop_requests dr
    WHERE dr.id = p_request_id;
  END IF;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_drop_request_v2(p_plan_id uuid, p_rejection_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id       UUID := auth.uid();
  v_plan           RECORD;
  v_report_status  TEXT;
  v_month_order    TEXT[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  v_month_idx      INTEGER;
  v_next_month     TEXT;
  v_next_year      INTEGER;
  v_penalty_1      INTEGER;
  v_penalty_2      INTEGER;
  v_new_max        INTEGER;
  v_new_status     TEXT;
  v_new_plan_id    UUID;
BEGIN
  -- 1. Fetch the plan
  SELECT * INTO v_plan FROM action_plans WHERE id = p_plan_id;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'Action plan not found';
  END IF;

  IF NOT COALESCE(v_plan.is_drop_pending, FALSE) THEN
    RAISE EXCEPTION 'This plan does not have a pending drop request';
  END IF;

  -- 2. Verify caller is admin or executive
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND LOWER(role) IN ('admin', 'executive')
  ) THEN
    RAISE EXCEPTION 'Only Admin or Executive can reject drop requests';
  END IF;

  -- 3. Also update legacy drop_requests if any exist
  UPDATE drop_requests
  SET status = 'REJECTED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE plan_id = p_plan_id
    AND status = 'PENDING';

  -- 4. Determine Report Status
  v_report_status := COALESCE(v_plan.submission_status, 'draft');

  -- 5. Branch Logic
  IF v_report_status = 'submitted' THEN
    -- BRANCH A: Report is CLOSED (Submitted)
    -- Must Auto-Carry Over to Next Month

    -- A1. Calculate Next Month
    v_month_idx := array_position(v_month_order, v_plan.month);
    IF v_month_idx IS NULL THEN
      RAISE EXCEPTION 'Invalid month in plan: %', v_plan.month;
    END IF;

    IF v_month_idx = 12 THEN
      v_next_month := 'Jan';
      v_next_year := v_plan.year + 1;
    ELSE
      v_next_month := v_month_order[v_month_idx + 1];
      v_next_year := v_plan.year;
    END IF;

    -- A2. Fetch Penalty Settings
    SELECT carry_over_penalty_1, carry_over_penalty_2
    INTO v_penalty_1, v_penalty_2
    FROM system_settings
    WHERE id = 1;

    IF v_penalty_1 IS NULL THEN v_penalty_1 := 80; END IF;
    IF v_penalty_2 IS NULL THEN v_penalty_2 := 50; END IF;

    -- A3. Determine New Status & Max Score
    IF COALESCE(v_plan.carry_over_status, 'Normal') = 'Normal' THEN
      v_new_status := 'Late_Month_1';
      v_new_max := v_penalty_1;
    ELSIF v_plan.carry_over_status = 'Late_Month_1' THEN
      v_new_status := 'Late_Month_2';
      v_new_max := v_penalty_2;
    ELSE
      v_new_status := 'Late_Month_2';
      v_new_max := v_penalty_2;
    END IF;

    -- A4. Fail Current Plan
    UPDATE action_plans
    SET status = 'Not Achieved',
        quality_score = 0,
        is_drop_pending = FALSE,
        remark = CASE
          WHEN remark IS NOT NULL AND trim(remark) <> '' THEN remark || E'\n[Drop Rejected & Auto-Carried Over: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
          ELSE '[Drop Rejected & Auto-Carried Over: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
        END,
        updated_at = NOW()
    WHERE id = p_plan_id;

    -- A5. Create Carried Over Plan
    INSERT INTO action_plans (
      department_code, year, month,
      goal_strategy, action_plan, indicator, pic,
      report_format, area_focus, category, evidence,
      status, carry_over_status, origin_plan_id, max_possible_score,
      is_carry_over, created_at, updated_at
    ) VALUES (
      v_plan.department_code, v_next_year, v_next_month,
      v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic,
      v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
      'Open', v_new_status, p_plan_id, v_new_max,
      true, now(), now()
    ) RETURNING id INTO v_new_plan_id;

    -- A6. Audit Log
    INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
    VALUES (
      v_new_plan_id, v_admin_id, 'CREATED',
      NULL,
      jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', p_plan_id, 'max_possible_score', v_new_max),
      format('Auto-carried over due to Drop Rejection on submitted report (%s %s). Next Month: %s %s', v_plan.month, v_plan.year, v_next_month, v_next_year)
    );

  ELSE
    -- BRANCH B: Report is OPEN (Draft)
    -- Just restore to Open
    UPDATE action_plans
    SET status = 'Open',
        is_drop_pending = FALSE,
        resolution_type = NULL,
        remark = CASE
          WHEN remark IS NOT NULL AND trim(remark) <> '' THEN remark || E'\n[Drop Rejected: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
          ELSE '[Drop Rejected: ' || COALESCE(p_rejection_reason, 'No reason provided') || ']'
        END,
        updated_at = NOW()
    WHERE id = p_plan_id;
  END IF;

  -- 6. Audit log for rejection
  INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
  VALUES (
    p_plan_id, v_admin_id, 'STATUS_CHANGE',
    '"Not Achieved (Pending Drop)"',
    CASE WHEN v_report_status = 'submitted' THEN '"Not Achieved (Carried Over)"' ELSE '"Open"' END,
    'Drop request rejected. Reason: ' || COALESCE(p_rejection_reason, 'No reason provided')
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.relock_expired_unlocks()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- Find all plans where unlock was approved but the window has expired
  UPDATE public.action_plans
  SET unlock_status      = NULL,
      unlock_approved_by = NULL,
      unlock_approved_at = NULL,
      approved_until     = NULL,
      updated_at         = now()
  WHERE unlock_status = 'approved'
    AND approved_until IS NOT NULL
    AND approved_until < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Log if any plans were re-locked
  IF v_count > 0 THEN
    RAISE LOG 'relock_expired_unlocks: Re-locked % plan(s) with expired temporary unlock', v_count;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'relocked_count', v_count,
    'run_at', now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.report_action_plan_blocker(p_plan_id uuid, p_blocker_reason text, p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan RECORD;
  v_leader RECORD;
  v_actor_name TEXT;
  v_plan_title TEXT;
  v_leaders_notified INT := 0;
BEGIN
  -- Step 1: Get the action plan and validate it exists
  SELECT id, department_code, action_plan, is_blocked
  INTO v_plan
  FROM action_plans
  WHERE id = p_plan_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Action plan not found');
  END IF;
  
  -- Step 2: Update the action plan
  UPDATE action_plans
  SET 
    is_blocked = TRUE,
    blocker_reason = p_blocker_reason,
    updated_at = NOW()
  WHERE id = p_plan_id;
  
  -- Step 3: Get actor name for notification message
  SELECT full_name INTO v_actor_name
  FROM profiles
  WHERE id = p_user_id;
  
  -- Truncate plan title for notification
  v_plan_title := LEFT(v_plan.action_plan, 50);
  IF LENGTH(v_plan.action_plan) > 50 THEN
    v_plan_title := v_plan_title || '...';
  END IF;
  
  -- Step 4: Find ALL department leaders and notify each one
  FOR v_leader IN 
    SELECT id 
    FROM profiles
    WHERE LOWER(role) = 'leader' 
    AND (
      department_code = v_plan.department_code
      OR v_plan.department_code = ANY(additional_departments)
    )
    AND id != p_user_id  -- Don't notify the reporter if they're also a leader
  LOOP
    INSERT INTO notifications (
      user_id,
      actor_id,
      resource_id,
      resource_type,
      type,
      title,
      message,
      is_read,
      created_at
    ) VALUES (
      v_leader.id,
      p_user_id,
      p_plan_id,
      'ACTION_PLAN',
      'BLOCKER_REPORTED',
      'Blocker Reported: ' || v_plan_title,
      COALESCE(v_actor_name, 'A team member') || ' reported a blocker: "' || LEFT(p_blocker_reason, 100) || CASE WHEN LENGTH(p_blocker_reason) > 100 THEN '...' ELSE '' END || '"',
      FALSE,
      NOW()
    );
    v_leaders_notified := v_leaders_notified + 1;
  END LOOP;
  
  -- Step 5: Log to progress_logs for history
  INSERT INTO progress_logs (
    action_plan_id,
    user_id,
    message,
    created_at
  ) VALUES (
    p_plan_id,
    p_user_id,
    '[BLOCKER REPORTED] ' || p_blocker_reason,
    NOW()
  );
  
  RETURN json_build_object(
    'success', true,
    'leaders_notified', v_leaders_notified
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_action_plans_safe()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_copies int;
  reset_masters int;
BEGIN
  -- 1. PRUNE: Delete carry-over copies (children) to prevent duplication
  -- These are plans that were created as copies of a master plan
  DELETE FROM action_plans 
  WHERE origin_plan_id IS NOT NULL;
  
  GET DIAGNOSTICS deleted_copies = ROW_COUNT;

  -- 2. CLEANUP: Clear request tables and logs
  -- TRUNCATE is faster and cleaner for these tables
  TRUNCATE TABLE drop_requests CASCADE;
  TRUNCATE TABLE audit_logs;
  TRUNCATE TABLE notifications;
  TRUNCATE TABLE progress_logs;

  -- 3. RESET: Reset the Master Plans (simulating fresh start)
  -- Only touch plans that are originals (origin_plan_id IS NULL)
  UPDATE action_plans
  SET
    -- Status & workflow
    status = 'Open',
    submission_status = 'draft',
    submitted_at = NULL,
    submitted_by = NULL,
    -- Scores & grading
    quality_score = NULL,
    leader_feedback = NULL,
    admin_feedback = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,
    -- Carry-over fields
    carry_over_status = 'Normal', -- FIX: Was NULL which violated NOT NULL constraint
    max_possible_score = 100,
    -- origin_plan_id is ALREADY NULL, no need to touch it
    resolution_type = NULL,
    carried_to_month = NULL,
    is_carry_over = FALSE,
    -- Blocker fields
    is_blocked = FALSE,
    blocker_reason = NULL,
    blocker_category = NULL,
    attention_level = 'Standard',
    -- Drop request flag
    is_drop_pending = FALSE,
    -- Remarks & evidence links
    remark = NULL,
    specify_reason = NULL,
    outcome_link = NULL,
    -- Unlock fields
    unlock_status = NULL,
    unlock_reason = NULL,
    unlock_rejection_reason = NULL,
    unlock_requested_at = NULL,
    unlock_requested_by = NULL,
    unlock_approved_at = NULL,
    unlock_approved_by = NULL,
    approved_until = NULL,
    -- Soft-delete (restore any soft-deleted items)
    deleted_at = NULL,
    deleted_by = NULL,
    deletion_reason = NULL,
    -- Timestamp
    updated_at = NOW()
  WHERE origin_plan_id IS NULL; -- CRITICAL: Only reset masters
  
  GET DIAGNOSTICS reset_masters = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_copies', deleted_copies, 
    'reset_masters', reset_masters,
    'message', 'Safe Reset Complete (Fixed): Pruned copies and reset masters.'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_simulation_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_carry_over int;
  reset_parents int;
  deleted_duplicates int;
  deleted_drop_requests int;
  parent_ids uuid[];
  dropped_ids uuid[];
BEGIN
  -- STEP 1: Capture parent IDs BEFORE deleting children
  SELECT ARRAY_AGG(DISTINCT origin_plan_id)
  INTO parent_ids
  FROM action_plans
  WHERE origin_plan_id IS NOT NULL;

  -- STEP 2: Capture dropped plan IDs (resolved but no children)
  SELECT ARRAY_AGG(id)
  INTO dropped_ids
  FROM action_plans
  WHERE resolution_type = 'dropped'
    AND deleted_at IS NULL;

  -- STEP 3: Delete all carry-over children
  DELETE FROM action_plans
  WHERE origin_plan_id IS NOT NULL;
  GET DIAGNOSTICS deleted_carry_over = ROW_COUNT;

  -- STEP 4: Force reset all identified parents + dropped plans + any with resolution_type set
  UPDATE action_plans
  SET
    status = 'Open',
    resolution_type = NULL,
    carried_to_month = NULL,
    carry_over_status = 'Normal',
    max_possible_score = 100,
    quality_score = NULL,
    leader_feedback = NULL,
    admin_feedback = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,
    submission_status = 'draft',
    submitted_at = NULL,
    submitted_by = NULL,
    outcome_link = NULL,
    evidence = NULL,
    remark = NULL,
    specify_reason = NULL,
    unlock_status = NULL,
    unlock_reason = NULL,
    unlock_rejection_reason = NULL,
    unlock_requested_at = NULL,
    unlock_requested_by = NULL,
    unlock_approved_at = NULL,
    unlock_approved_by = NULL,
    approved_until = NULL,
    -- Blocker / Escalation cleanup
    is_blocked = FALSE,
    blocker_reason = NULL,
    alert_status = NULL,
    -- Drop request flag cleanup
    is_drop_pending = FALSE,
    updated_at = NOW()
  WHERE deleted_at IS NULL
    AND (
      id = ANY(COALESCE(parent_ids, '{}'))
      OR id = ANY(COALESCE(dropped_ids, '{}'))
      OR resolution_type IS NOT NULL
      -- Also catch any plan with stale flags
      OR is_drop_pending = TRUE
      OR is_blocked = TRUE
      OR alert_status IS NOT NULL
    );
  GET DIAGNOSTICS reset_parents = ROW_COUNT;

  -- STEP 5: Remove exact duplicates (safety net)
  DELETE FROM action_plans
  WHERE id IN (
    SELECT id FROM (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY action_plan, month, department_code, year
          ORDER BY created_at DESC
        ) AS rn
      FROM action_plans
      WHERE deleted_at IS NULL
    ) ranked
    WHERE rn > 1
  );
  GET DIAGNOSTICS deleted_duplicates = ROW_COUNT;

  -- ─────────────────────────────────────────────
  -- STEP 6: Clear drop requests (all history)
  -- NOTE: Must use TRUNCATE (not DELETE) because RLS is enabled
  --       on drop_requests with no DELETE policy, so DELETE
  --       silently removes 0 rows. TRUNCATE bypasses RLS.
  -- ─────────────────────────────────────────────
  TRUNCATE TABLE drop_requests CASCADE;
  deleted_drop_requests := 0; -- TRUNCATE doesn't support GET DIAGNOSTICS

  -- ─────────────────────────────────────────────
  -- STEP 7: Clear supporting tables
  -- ─────────────────────────────────────────────
  TRUNCATE TABLE audit_logs;
  TRUNCATE TABLE notifications;
  TRUNCATE TABLE progress_logs;

  RETURN jsonb_build_object(
    'deleted_carry_over', deleted_carry_over,
    'reset_parents', reset_parents,
    'deleted_duplicates', deleted_duplicates,
    'deleted_drop_requests', deleted_drop_requests
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_and_submit_report(p_department_code text, p_month text, p_year integer, p_resolutions jsonb, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_resolution jsonb;
  v_plan_id uuid;
  v_action text;
  v_plan record;
  v_penalty_1 integer;
  v_penalty_2 integer;
  v_new_max integer;
  v_new_status text;
  v_next_month text;
  v_next_year integer;
  v_new_plan_id uuid;
  v_carried_count integer := 0;
  v_dropped_count integer := 0;
  v_month_order text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  v_month_idx integer;
BEGIN
  -- 1. Fetch penalty settings
  SELECT carry_over_penalty_1, carry_over_penalty_2
    INTO v_penalty_1, v_penalty_2
    FROM system_settings
    WHERE id = 1;

  IF v_penalty_1 IS NULL THEN
    v_penalty_1 := 80;
    v_penalty_2 := 50;
  END IF;

  -- 2. Calculate next month
  v_month_idx := array_position(v_month_order, p_month);
  IF v_month_idx IS NULL THEN
    RAISE EXCEPTION 'Invalid month: %', p_month;
  END IF;

  IF v_month_idx = 12 THEN
    v_next_month := 'Jan';
    v_next_year := p_year + 1;
  ELSE
    v_next_month := v_month_order[v_month_idx + 1];
    v_next_year := p_year;
  END IF;

  -- 3. Process each resolution
  FOR v_resolution IN SELECT * FROM jsonb_array_elements(p_resolutions)
  LOOP
    v_plan_id := (v_resolution->>'plan_id')::uuid;
    v_action := v_resolution->>'action';

    -- Fetch the plan
    SELECT * INTO v_plan FROM action_plans
      WHERE id = v_plan_id
        AND department_code = p_department_code
        AND month = p_month
        AND year = p_year
        AND deleted_at IS NULL;

    IF v_plan IS NULL THEN
      RAISE EXCEPTION 'Plan % not found or does not match department/month/year', v_plan_id;
    END IF;

    IF v_plan.status NOT IN ('Open', 'On Progress', 'Blocked') THEN
      RAISE EXCEPTION 'Plan % has status "%" and cannot be resolved via wizard', v_plan_id, v_plan.status;
    END IF;

    IF v_action = 'carry_over' THEN
      IF v_plan.carry_over_status = 'Late_Month_2' THEN
        RAISE EXCEPTION 'Plan % has already been carried over twice. It must be dropped.', v_plan_id;
      END IF;

      IF v_plan.carry_over_status = 'Normal' THEN
        v_new_status := 'Late_Month_1';
        v_new_max := v_penalty_1;
      ELSIF v_plan.carry_over_status = 'Late_Month_1' THEN
        v_new_status := 'Late_Month_2';
        v_new_max := v_penalty_2;
      END IF;

      -- A. Mark current plan as Not Achieved with resolution_type
      -- CHANGED: quality_score = NULL (deferred scoring — will be set on report submission)
      UPDATE action_plans SET
        status = 'Not Achieved',
        quality_score = NULL,
        resolution_type = 'carried_over',
        carried_to_month = v_next_month,
        updated_at = now()
      WHERE id = v_plan_id;

      -- B. Create carried-over duplicate for next month
      INSERT INTO action_plans (
        department_code, year, month,
        goal_strategy, action_plan, indicator, pic,
        report_format, area_focus, category, evidence,
        status, carry_over_status, origin_plan_id, max_possible_score,
        is_carry_over, created_at, updated_at
      ) VALUES (
        v_plan.department_code, v_next_year, v_next_month,
        v_plan.goal_strategy, v_plan.action_plan, v_plan.indicator, v_plan.pic,
        v_plan.report_format, v_plan.area_focus, v_plan.category, v_plan.evidence,
        'Open', v_new_status, v_plan_id, v_new_max,
        true, now(), now()
      ) RETURNING id INTO v_new_plan_id;

      -- C. Audit log for the original plan
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (
        v_plan_id, p_user_id, 'CARRY_OVER',
        jsonb_build_object('status', v_plan.status, 'carry_over_status', v_plan.carry_over_status),
        jsonb_build_object('status', 'Not Achieved', 'carried_to_plan_id', v_new_plan_id, 'carried_to_month', v_next_month, 'max_possible_score', v_new_max),
        format('Carried over to %s %s (max score: %s%%). Original marked Not Achieved.', v_next_month, v_next_year, v_new_max)
      );

      -- D. Audit log for the new plan
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (
        v_new_plan_id, p_user_id, 'CREATED',
        NULL,
        jsonb_build_object('carry_over_status', v_new_status, 'origin_plan_id', v_plan_id, 'max_possible_score', v_new_max),
        format('Created via carry-over from %s %s. Max achievable score: %s%%.', p_month, p_year, v_new_max)
      );

      v_carried_count := v_carried_count + 1;

    ELSIF v_action = 'drop' THEN
      -- Mark as Not Achieved with resolution_type = dropped
      -- CHANGED: quality_score = NULL (deferred scoring — will be set on report submission)
      UPDATE action_plans SET
        status = 'Not Achieved',
        quality_score = NULL,
        resolution_type = 'dropped',
        updated_at = now()
      WHERE id = v_plan_id;

      -- Audit log
      INSERT INTO audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
      VALUES (
        v_plan_id, p_user_id, 'STATUS_UPDATE',
        jsonb_build_object('status', v_plan.status),
        jsonb_build_object('status', 'Not Achieved', 'resolution', 'dropped'),
        format('Dropped via monthly resolution wizard. Marked Not Achieved.')
      );

      v_dropped_count := v_dropped_count + 1;

    ELSE
      RAISE EXCEPTION 'Invalid action "%" for plan %. Must be carry_over or drop.', v_action, v_plan_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'carried_over', v_carried_count,
    'dropped', v_dropped_count,
    'next_month', v_next_month,
    'next_year', v_next_year
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.revoke_unlock_access(p_plan_id uuid, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan record;
  v_requester_id uuid;
BEGIN
  -- Fetch plan and verify it has an active approved unlock
  SELECT id, unlock_status, approved_until, unlock_requested_by, action_plan
  INTO v_plan
  FROM public.action_plans
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_id;
  END IF;

  IF v_plan.unlock_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Plan does not have an active unlock (current status: %)', COALESCE(v_plan.unlock_status, 'none');
  END IF;

  v_requester_id := v_plan.unlock_requested_by;

  -- Revoke: clear all unlock fields to re-lock immediately
  UPDATE public.action_plans
  SET unlock_status            = NULL,
      unlock_approved_by       = NULL,
      unlock_approved_at       = NULL,
      approved_until           = NULL,
      unlock_requested_by      = NULL,
      unlock_requested_at      = NULL,
      unlock_reason            = NULL,
      unlock_rejection_reason  = NULL,
      updated_at               = now()
  WHERE id = p_plan_id;

  -- Notify the original requester
  IF v_requester_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, actor_id, resource_id, resource_type, type, title, message)
    VALUES (
      v_requester_id,
      p_admin_id,
      p_plan_id,
      'ACTION_PLAN',
      'UNLOCK_REVOKED',
      'Access Revoked',
      'Admin has manually re-locked your plan. If you still need access, please submit a new unlock request.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'REVOKED',
    'plan_id', p_plan_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_drop_request(p_plan_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id UUID;
  v_user_id UUID := auth.uid();
BEGIN
  -- Validate inputs
  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'plan_id is required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Reason must be at least 5 characters';
  END IF;

  -- Check plan exists and is not already pending
  IF NOT EXISTS (SELECT 1 FROM action_plans WHERE id = p_plan_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Action plan not found';
  END IF;
  IF EXISTS (SELECT 1 FROM action_plans WHERE id = p_plan_id AND is_drop_pending = TRUE) THEN
    RAISE EXCEPTION 'A drop request is already pending for this plan';
  END IF;

  -- Check no other PENDING request exists for this plan
  IF EXISTS (SELECT 1 FROM drop_requests WHERE plan_id = p_plan_id AND status = 'PENDING') THEN
    RAISE EXCEPTION 'A drop request is already pending for this plan';
  END IF;

  -- Insert the request
  INSERT INTO drop_requests (plan_id, user_id, reason)
  VALUES (p_plan_id, v_user_id, trim(p_reason))
  RETURNING id INTO v_request_id;

  -- Flag the action plan as drop-pending
  UPDATE action_plans
  SET is_drop_pending = TRUE
  WHERE id = p_plan_id;

  RETURN v_request_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_carry_over_settings(p_penalty_1 integer, p_penalty_2 integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  -- Authorization: admin only
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'Administrator') THEN
    RAISE EXCEPTION 'Unauthorized: only administrators can update carry-over settings';
  END IF;

  -- Validation
  IF p_penalty_1 < 0 OR p_penalty_1 > 100 THEN
    RAISE EXCEPTION 'penalty_1 must be between 0 and 100';
  END IF;
  IF p_penalty_2 < 0 OR p_penalty_2 > 100 THEN
    RAISE EXCEPTION 'penalty_2 must be between 0 and 100';
  END IF;
  IF p_penalty_2 >= p_penalty_1 THEN
    RAISE EXCEPTION 'penalty_2 must be less than penalty_1 (second carry-over should be stricter)';
  END IF;

  -- Upsert
  INSERT INTO system_settings (id, carry_over_penalty_1, carry_over_penalty_2, updated_at, updated_by)
  VALUES (1, p_penalty_1, p_penalty_2, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE SET
    carry_over_penalty_1 = p_penalty_1,
    carry_over_penalty_2 = p_penalty_2,
    updated_at = now(),
    updated_by = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'carry_over_penalty_1', p_penalty_1,
    'carry_over_penalty_2', p_penalty_2
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_dropdown_options_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_plan_evidence(p_plan_id uuid, p_evidence text DEFAULT NULL::text, p_attachments jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan RECORD;
BEGIN
  -- Validate plan exists
  SELECT id INTO v_plan
  FROM action_plans
  WHERE id = p_plan_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action plan not found: %', p_plan_id;
  END IF;

  -- Update evidence fields
  UPDATE action_plans
  SET
    evidence    = COALESCE(p_evidence, evidence),
    attachments = COALESCE(p_attachments, attachments),
    updated_at  = NOW()
  WHERE id = p_plan_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_system_settings_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_master_options(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    v_item      JSONB;
    v_inserted  INT := 0;
    v_updated   INT := 0;
    v_skipped   INT := 0;
    v_category  TEXT;
    v_label     TEXT;
    v_value     TEXT;
    v_sort      INT;
    v_active    BOOLEAN;
    v_existing  UUID;
BEGIN
    -- Validate input is a JSON array
    IF jsonb_typeof(p_items) != 'array' THEN
        RAISE EXCEPTION 'Input must be a JSON array, got: %', jsonb_typeof(p_items);
    END IF;

    -- Process each item in the array
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Extract fields with validation
        v_category := v_item ->> 'category';
        v_label    := v_item ->> 'label';
        v_value    := v_item ->> 'value';
        v_sort     := COALESCE((v_item ->> 'sort_order')::INT, 0);
        v_active   := COALESCE((v_item ->> 'is_active')::BOOLEAN, TRUE);

        -- Skip rows missing required fields
        IF v_category IS NULL OR v_category = '' OR v_label IS NULL OR v_label = '' THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- Auto-generate value from label if not provided
        IF v_value IS NULL OR v_value = '' THEN
            v_value := v_label;
        END IF;

        -- Check if this (category, value) already exists
        SELECT id INTO v_existing
        FROM master_options
        WHERE category = v_category AND value = v_value
        LIMIT 1;

        IF v_existing IS NOT NULL THEN
            -- UPDATE existing row
            UPDATE master_options
            SET label      = v_label,
                sort_order = v_sort,
                is_active  = v_active
            WHERE id = v_existing;

            v_updated := v_updated + 1;
        ELSE
            -- INSERT new row
            INSERT INTO master_options (category, label, value, sort_order, is_active)
            VALUES (v_category, v_label, v_value, v_sort, v_active);

            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;

    -- Return summary
    RETURN jsonb_build_object(
        'success', TRUE,
        'inserted', v_inserted,
        'updated', v_updated,
        'skipped', v_skipped,
        'total_processed', v_inserted + v_updated + v_skipped
    );
END;
$function$
;

grant delete on table "public"."action_plans" to "anon";

grant insert on table "public"."action_plans" to "anon";

grant references on table "public"."action_plans" to "anon";

grant select on table "public"."action_plans" to "anon";

grant trigger on table "public"."action_plans" to "anon";

grant truncate on table "public"."action_plans" to "anon";

grant update on table "public"."action_plans" to "anon";

grant delete on table "public"."action_plans" to "authenticated";

grant insert on table "public"."action_plans" to "authenticated";

grant references on table "public"."action_plans" to "authenticated";

grant select on table "public"."action_plans" to "authenticated";

grant trigger on table "public"."action_plans" to "authenticated";

grant truncate on table "public"."action_plans" to "authenticated";

grant update on table "public"."action_plans" to "authenticated";

grant delete on table "public"."action_plans" to "service_role";

grant insert on table "public"."action_plans" to "service_role";

grant references on table "public"."action_plans" to "service_role";

grant select on table "public"."action_plans" to "service_role";

grant trigger on table "public"."action_plans" to "service_role";

grant truncate on table "public"."action_plans" to "service_role";

grant update on table "public"."action_plans" to "service_role";

grant delete on table "public"."annual_targets" to "anon";

grant insert on table "public"."annual_targets" to "anon";

grant references on table "public"."annual_targets" to "anon";

grant select on table "public"."annual_targets" to "anon";

grant trigger on table "public"."annual_targets" to "anon";

grant truncate on table "public"."annual_targets" to "anon";

grant update on table "public"."annual_targets" to "anon";

grant delete on table "public"."annual_targets" to "authenticated";

grant insert on table "public"."annual_targets" to "authenticated";

grant references on table "public"."annual_targets" to "authenticated";

grant select on table "public"."annual_targets" to "authenticated";

grant trigger on table "public"."annual_targets" to "authenticated";

grant truncate on table "public"."annual_targets" to "authenticated";

grant update on table "public"."annual_targets" to "authenticated";

grant delete on table "public"."annual_targets" to "service_role";

grant insert on table "public"."annual_targets" to "service_role";

grant references on table "public"."annual_targets" to "service_role";

grant select on table "public"."annual_targets" to "service_role";

grant trigger on table "public"."annual_targets" to "service_role";

grant truncate on table "public"."annual_targets" to "service_role";

grant update on table "public"."annual_targets" to "service_role";

grant delete on table "public"."audit_logs" to "anon";

grant insert on table "public"."audit_logs" to "anon";

grant references on table "public"."audit_logs" to "anon";

grant select on table "public"."audit_logs" to "anon";

grant trigger on table "public"."audit_logs" to "anon";

grant truncate on table "public"."audit_logs" to "anon";

grant update on table "public"."audit_logs" to "anon";

grant delete on table "public"."audit_logs" to "authenticated";

grant insert on table "public"."audit_logs" to "authenticated";

grant references on table "public"."audit_logs" to "authenticated";

grant select on table "public"."audit_logs" to "authenticated";

grant trigger on table "public"."audit_logs" to "authenticated";

grant truncate on table "public"."audit_logs" to "authenticated";

grant update on table "public"."audit_logs" to "authenticated";

grant delete on table "public"."audit_logs" to "service_role";

grant insert on table "public"."audit_logs" to "service_role";

grant references on table "public"."audit_logs" to "service_role";

grant select on table "public"."audit_logs" to "service_role";

grant trigger on table "public"."audit_logs" to "service_role";

grant truncate on table "public"."audit_logs" to "service_role";

grant update on table "public"."audit_logs" to "service_role";

grant delete on table "public"."departments" to "anon";

grant insert on table "public"."departments" to "anon";

grant references on table "public"."departments" to "anon";

grant select on table "public"."departments" to "anon";

grant trigger on table "public"."departments" to "anon";

grant truncate on table "public"."departments" to "anon";

grant update on table "public"."departments" to "anon";

grant delete on table "public"."departments" to "authenticated";

grant insert on table "public"."departments" to "authenticated";

grant references on table "public"."departments" to "authenticated";

grant select on table "public"."departments" to "authenticated";

grant trigger on table "public"."departments" to "authenticated";

grant truncate on table "public"."departments" to "authenticated";

grant update on table "public"."departments" to "authenticated";

grant delete on table "public"."departments" to "service_role";

grant insert on table "public"."departments" to "service_role";

grant references on table "public"."departments" to "service_role";

grant select on table "public"."departments" to "service_role";

grant trigger on table "public"."departments" to "service_role";

grant truncate on table "public"."departments" to "service_role";

grant update on table "public"."departments" to "service_role";

grant delete on table "public"."drop_requests" to "anon";

grant insert on table "public"."drop_requests" to "anon";

grant references on table "public"."drop_requests" to "anon";

grant select on table "public"."drop_requests" to "anon";

grant trigger on table "public"."drop_requests" to "anon";

grant truncate on table "public"."drop_requests" to "anon";

grant update on table "public"."drop_requests" to "anon";

grant delete on table "public"."drop_requests" to "authenticated";

grant insert on table "public"."drop_requests" to "authenticated";

grant references on table "public"."drop_requests" to "authenticated";

grant select on table "public"."drop_requests" to "authenticated";

grant trigger on table "public"."drop_requests" to "authenticated";

grant truncate on table "public"."drop_requests" to "authenticated";

grant update on table "public"."drop_requests" to "authenticated";

grant delete on table "public"."drop_requests" to "service_role";

grant insert on table "public"."drop_requests" to "service_role";

grant references on table "public"."drop_requests" to "service_role";

grant select on table "public"."drop_requests" to "service_role";

grant trigger on table "public"."drop_requests" to "service_role";

grant truncate on table "public"."drop_requests" to "service_role";

grant update on table "public"."drop_requests" to "service_role";

grant delete on table "public"."dropdown_options" to "anon";

grant insert on table "public"."dropdown_options" to "anon";

grant references on table "public"."dropdown_options" to "anon";

grant select on table "public"."dropdown_options" to "anon";

grant trigger on table "public"."dropdown_options" to "anon";

grant truncate on table "public"."dropdown_options" to "anon";

grant update on table "public"."dropdown_options" to "anon";

grant delete on table "public"."dropdown_options" to "authenticated";

grant insert on table "public"."dropdown_options" to "authenticated";

grant references on table "public"."dropdown_options" to "authenticated";

grant select on table "public"."dropdown_options" to "authenticated";

grant trigger on table "public"."dropdown_options" to "authenticated";

grant truncate on table "public"."dropdown_options" to "authenticated";

grant update on table "public"."dropdown_options" to "authenticated";

grant delete on table "public"."dropdown_options" to "service_role";

grant insert on table "public"."dropdown_options" to "service_role";

grant references on table "public"."dropdown_options" to "service_role";

grant select on table "public"."dropdown_options" to "service_role";

grant trigger on table "public"."dropdown_options" to "service_role";

grant truncate on table "public"."dropdown_options" to "service_role";

grant update on table "public"."dropdown_options" to "service_role";

grant delete on table "public"."historical_stats" to "anon";

grant insert on table "public"."historical_stats" to "anon";

grant references on table "public"."historical_stats" to "anon";

grant select on table "public"."historical_stats" to "anon";

grant trigger on table "public"."historical_stats" to "anon";

grant truncate on table "public"."historical_stats" to "anon";

grant update on table "public"."historical_stats" to "anon";

grant delete on table "public"."historical_stats" to "authenticated";

grant insert on table "public"."historical_stats" to "authenticated";

grant references on table "public"."historical_stats" to "authenticated";

grant select on table "public"."historical_stats" to "authenticated";

grant trigger on table "public"."historical_stats" to "authenticated";

grant truncate on table "public"."historical_stats" to "authenticated";

grant update on table "public"."historical_stats" to "authenticated";

grant delete on table "public"."historical_stats" to "service_role";

grant insert on table "public"."historical_stats" to "service_role";

grant references on table "public"."historical_stats" to "service_role";

grant select on table "public"."historical_stats" to "service_role";

grant trigger on table "public"."historical_stats" to "service_role";

grant truncate on table "public"."historical_stats" to "service_role";

grant update on table "public"."historical_stats" to "service_role";

grant delete on table "public"."master_options" to "anon";

grant insert on table "public"."master_options" to "anon";

grant references on table "public"."master_options" to "anon";

grant select on table "public"."master_options" to "anon";

grant trigger on table "public"."master_options" to "anon";

grant truncate on table "public"."master_options" to "anon";

grant update on table "public"."master_options" to "anon";

grant delete on table "public"."master_options" to "authenticated";

grant insert on table "public"."master_options" to "authenticated";

grant references on table "public"."master_options" to "authenticated";

grant select on table "public"."master_options" to "authenticated";

grant trigger on table "public"."master_options" to "authenticated";

grant truncate on table "public"."master_options" to "authenticated";

grant update on table "public"."master_options" to "authenticated";

grant delete on table "public"."master_options" to "service_role";

grant insert on table "public"."master_options" to "service_role";

grant references on table "public"."master_options" to "service_role";

grant select on table "public"."master_options" to "service_role";

grant trigger on table "public"."master_options" to "service_role";

grant truncate on table "public"."master_options" to "service_role";

grant update on table "public"."master_options" to "service_role";

grant delete on table "public"."monthly_lock_schedules" to "anon";

grant insert on table "public"."monthly_lock_schedules" to "anon";

grant references on table "public"."monthly_lock_schedules" to "anon";

grant select on table "public"."monthly_lock_schedules" to "anon";

grant trigger on table "public"."monthly_lock_schedules" to "anon";

grant truncate on table "public"."monthly_lock_schedules" to "anon";

grant update on table "public"."monthly_lock_schedules" to "anon";

grant delete on table "public"."monthly_lock_schedules" to "authenticated";

grant insert on table "public"."monthly_lock_schedules" to "authenticated";

grant references on table "public"."monthly_lock_schedules" to "authenticated";

grant select on table "public"."monthly_lock_schedules" to "authenticated";

grant trigger on table "public"."monthly_lock_schedules" to "authenticated";

grant truncate on table "public"."monthly_lock_schedules" to "authenticated";

grant update on table "public"."monthly_lock_schedules" to "authenticated";

grant delete on table "public"."monthly_lock_schedules" to "service_role";

grant insert on table "public"."monthly_lock_schedules" to "service_role";

grant references on table "public"."monthly_lock_schedules" to "service_role";

grant select on table "public"."monthly_lock_schedules" to "service_role";

grant trigger on table "public"."monthly_lock_schedules" to "service_role";

grant truncate on table "public"."monthly_lock_schedules" to "service_role";

grant update on table "public"."monthly_lock_schedules" to "service_role";

grant delete on table "public"."notifications" to "anon";

grant insert on table "public"."notifications" to "anon";

grant references on table "public"."notifications" to "anon";

grant select on table "public"."notifications" to "anon";

grant trigger on table "public"."notifications" to "anon";

grant truncate on table "public"."notifications" to "anon";

grant update on table "public"."notifications" to "anon";

grant delete on table "public"."notifications" to "authenticated";

grant insert on table "public"."notifications" to "authenticated";

grant references on table "public"."notifications" to "authenticated";

grant select on table "public"."notifications" to "authenticated";

grant trigger on table "public"."notifications" to "authenticated";

grant truncate on table "public"."notifications" to "authenticated";

grant update on table "public"."notifications" to "authenticated";

grant delete on table "public"."notifications" to "service_role";

grant insert on table "public"."notifications" to "service_role";

grant references on table "public"."notifications" to "service_role";

grant select on table "public"."notifications" to "service_role";

grant trigger on table "public"."notifications" to "service_role";

grant truncate on table "public"."notifications" to "service_role";

grant update on table "public"."notifications" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."progress_logs" to "anon";

grant insert on table "public"."progress_logs" to "anon";

grant references on table "public"."progress_logs" to "anon";

grant select on table "public"."progress_logs" to "anon";

grant trigger on table "public"."progress_logs" to "anon";

grant truncate on table "public"."progress_logs" to "anon";

grant update on table "public"."progress_logs" to "anon";

grant delete on table "public"."progress_logs" to "authenticated";

grant insert on table "public"."progress_logs" to "authenticated";

grant references on table "public"."progress_logs" to "authenticated";

grant select on table "public"."progress_logs" to "authenticated";

grant trigger on table "public"."progress_logs" to "authenticated";

grant truncate on table "public"."progress_logs" to "authenticated";

grant update on table "public"."progress_logs" to "authenticated";

grant delete on table "public"."progress_logs" to "service_role";

grant insert on table "public"."progress_logs" to "service_role";

grant references on table "public"."progress_logs" to "service_role";

grant select on table "public"."progress_logs" to "service_role";

grant trigger on table "public"."progress_logs" to "service_role";

grant truncate on table "public"."progress_logs" to "service_role";

grant update on table "public"."progress_logs" to "service_role";

grant delete on table "public"."role_permissions" to "anon";

grant insert on table "public"."role_permissions" to "anon";

grant references on table "public"."role_permissions" to "anon";

grant select on table "public"."role_permissions" to "anon";

grant trigger on table "public"."role_permissions" to "anon";

grant truncate on table "public"."role_permissions" to "anon";

grant update on table "public"."role_permissions" to "anon";

grant delete on table "public"."role_permissions" to "authenticated";

grant insert on table "public"."role_permissions" to "authenticated";

grant references on table "public"."role_permissions" to "authenticated";

grant select on table "public"."role_permissions" to "authenticated";

grant trigger on table "public"."role_permissions" to "authenticated";

grant truncate on table "public"."role_permissions" to "authenticated";

grant update on table "public"."role_permissions" to "authenticated";

grant delete on table "public"."role_permissions" to "service_role";

grant insert on table "public"."role_permissions" to "service_role";

grant references on table "public"."role_permissions" to "service_role";

grant select on table "public"."role_permissions" to "service_role";

grant trigger on table "public"."role_permissions" to "service_role";

grant truncate on table "public"."role_permissions" to "service_role";

grant update on table "public"."role_permissions" to "service_role";

grant delete on table "public"."system_settings" to "anon";

grant insert on table "public"."system_settings" to "anon";

grant references on table "public"."system_settings" to "anon";

grant select on table "public"."system_settings" to "anon";

grant trigger on table "public"."system_settings" to "anon";

grant truncate on table "public"."system_settings" to "anon";

grant update on table "public"."system_settings" to "anon";

grant delete on table "public"."system_settings" to "authenticated";

grant insert on table "public"."system_settings" to "authenticated";

grant references on table "public"."system_settings" to "authenticated";

grant select on table "public"."system_settings" to "authenticated";

grant trigger on table "public"."system_settings" to "authenticated";

grant truncate on table "public"."system_settings" to "authenticated";

grant update on table "public"."system_settings" to "authenticated";

grant delete on table "public"."system_settings" to "service_role";

grant insert on table "public"."system_settings" to "service_role";

grant references on table "public"."system_settings" to "service_role";

grant select on table "public"."system_settings" to "service_role";

grant trigger on table "public"."system_settings" to "service_role";

grant truncate on table "public"."system_settings" to "service_role";

grant update on table "public"."system_settings" to "service_role";


  create policy "Admins can DELETE action plans"
  on "public"."action_plans"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can INSERT action plans"
  on "public"."action_plans"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can SELECT all action plans"
  on "public"."action_plans"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can UPDATE all action plans"
  on "public"."action_plans"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Dept heads can SELECT own department plans"
  on "public"."action_plans"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'dept_head'::text) AND (profiles.department_code = action_plans.department_code)))));



  create policy "Dept heads can UPDATE status, outcome, remark only"
  on "public"."action_plans"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'dept_head'::text) AND (profiles.department_code = action_plans.department_code)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'dept_head'::text) AND (profiles.department_code = action_plans.department_code)))));



  create policy "Executives can SELECT all action plans"
  on "public"."action_plans"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'executive'::text)))));



  create policy "action_plans_delete"
  on "public"."action_plans"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR ((profiles.role = 'leader'::text) AND ((profiles.department_code = action_plans.department_code) OR (action_plans.department_code = ANY (profiles.additional_departments)))))))));



  create policy "action_plans_insert"
  on "public"."action_plans"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR ((profiles.role = 'leader'::text) AND ((profiles.department_code = action_plans.department_code) OR (action_plans.department_code = ANY (profiles.additional_departments)))))))));



  create policy "action_plans_select"
  on "public"."action_plans"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.department_code = action_plans.department_code) OR (action_plans.department_code = ANY (profiles.additional_departments)))))));



  create policy "action_plans_update"
  on "public"."action_plans"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (((profiles.role = 'leader'::text) OR (profiles.role = 'staff'::text)) AND ((profiles.department_code = action_plans.department_code) OR (action_plans.department_code = ANY (profiles.additional_departments)))))))));



  create policy "admins_view_all_action_plans"
  on "public"."action_plans"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role ~~* '%admin%'::text) OR (profiles.role ~~* '%leader%'::text) OR (profiles.role ~~* '%head%'::text))))));



  create policy "users_view_own_department_plans"
  on "public"."action_plans"
  as permissive
  for select
  to authenticated
using ((department_code = ( SELECT profiles.department_code
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));



  create policy "Admins can delete annual_targets"
  on "public"."annual_targets"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can insert annual_targets"
  on "public"."annual_targets"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can update annual_targets"
  on "public"."annual_targets"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Anyone can read annual_targets"
  on "public"."annual_targets"
  as permissive
  for select
  to public
using (true);



  create policy "Executives can SELECT all audit logs"
  on "public"."audit_logs"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'executive'::text)))));



  create policy "Users can insert audit logs"
  on "public"."audit_logs"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "admins_view_all_logs"
  on "public"."audit_logs"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role ~~* '%admin%'::text) OR (profiles.role ~~* '%leader%'::text) OR (profiles.role ~~* '%head%'::text))))));



  create policy "audit_logs_select"
  on "public"."audit_logs"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.profiles
     JOIN public.action_plans ap ON ((ap.id = audit_logs.action_plan_id)))
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (ap.department_code = profiles.department_code) OR (ap.department_code = ANY (profiles.additional_departments)))))));



  create policy "Admins can delete departments"
  on "public"."departments"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can insert departments"
  on "public"."departments"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can update departments"
  on "public"."departments"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Anyone can read departments"
  on "public"."departments"
  as permissive
  for select
  to public
using (true);



  create policy "Anyone can view departments"
  on "public"."departments"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "Admins can update drop_requests"
  on "public"."drop_requests"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (lower(profiles.role) = ANY (ARRAY['admin'::text, 'executive'::text]))))));



  create policy "Authenticated users can read drop_requests"
  on "public"."drop_requests"
  as permissive
  for select
  to public
using ((auth.uid() IS NOT NULL));



  create policy "Users can create their own drop_requests"
  on "public"."drop_requests"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Admins can insert dropdown options"
  on "public"."dropdown_options"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can read all dropdown options"
  on "public"."dropdown_options"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can update dropdown options"
  on "public"."dropdown_options"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Anyone can read active dropdown options"
  on "public"."dropdown_options"
  as permissive
  for select
  to public
using ((is_active = true));



  create policy "Enable all access for authenticated users"
  on "public"."dropdown_options"
  as permissive
  for all
  to public
using ((auth.role() = 'authenticated'::text))
with check ((auth.role() = 'authenticated'::text));



  create policy "Admins can delete historical_stats"
  on "public"."historical_stats"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can insert historical_stats"
  on "public"."historical_stats"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can update historical_stats"
  on "public"."historical_stats"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Anyone can read historical_stats"
  on "public"."historical_stats"
  as permissive
  for select
  to public
using (true);



  create policy "historical_stats_select"
  on "public"."historical_stats"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role = 'admin'::text) OR (profiles.department_code = historical_stats.department_code) OR (historical_stats.department_code = ANY (profiles.additional_departments)))))));



  create policy "master_options_delete_admin"
  on "public"."master_options"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "master_options_insert_admin"
  on "public"."master_options"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "master_options_read_authenticated"
  on "public"."master_options"
  as permissive
  for select
  to authenticated
using (true);



  create policy "master_options_update_admin"
  on "public"."master_options"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Admins can manage monthly lock schedules"
  on "public"."monthly_lock_schedules"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (lower(profiles.role) = 'admin'::text)))));



  create policy "Anyone can read monthly lock schedules"
  on "public"."monthly_lock_schedules"
  as permissive
  for select
  to public
using (true);



  create policy "System can insert notifications"
  on "public"."notifications"
  as permissive
  for insert
  to public
with check (true);



  create policy "Users can delete own notifications"
  on "public"."notifications"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can update own notifications"
  on "public"."notifications"
  as permissive
  for update
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Users can view own notifications"
  on "public"."notifications"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Admins can update all profiles"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid())) = ANY (ARRAY['admin'::text, 'Administrator'::text])))
with check ((( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid())) = ANY (ARRAY['admin'::text, 'Administrator'::text])));



  create policy "Users can view own profile"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "authenticated_read_all_profiles"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using (true);



  create policy "users_insert_own_profile"
  on "public"."profiles"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = id));



  create policy "users_update_own_profile"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((auth.uid() = id))
with check ((auth.uid() = id));



  create policy "Admin full access to progress_logs"
  on "public"."progress_logs"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Users can insert progress logs for their department"
  on "public"."progress_logs"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM (public.action_plans ap
     JOIN public.profiles p ON ((p.id = auth.uid())))
  WHERE ((ap.id = progress_logs.action_plan_id) AND ((p.role = 'admin'::text) OR (p.role = 'executive'::text) OR (ap.department_code = p.department_code) OR (ap.department_code = ANY (p.additional_departments)))))));



  create policy "Users can view progress logs for accessible action plans"
  on "public"."progress_logs"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM (public.action_plans ap
     JOIN public.profiles p ON ((p.id = auth.uid())))
  WHERE ((ap.id = progress_logs.action_plan_id) AND ((p.role = 'admin'::text) OR (p.role = 'executive'::text) OR (ap.department_code = p.department_code) OR (ap.department_code = ANY (p.additional_departments)))))));



  create policy "role_permissions_admin_delete"
  on "public"."role_permissions"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "role_permissions_admin_insert"
  on "public"."role_permissions"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "role_permissions_admin_update"
  on "public"."role_permissions"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "role_permissions_select_all"
  on "public"."role_permissions"
  as permissive
  for select
  to public
using (true);



  create policy "Admins can update system settings"
  on "public"."system_settings"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (lower(profiles.role) = 'admin'::text)))));



  create policy "Anyone can read system settings"
  on "public"."system_settings"
  as permissive
  for select
  to public
using (true);


CREATE TRIGGER action_plan_audit_trigger AFTER INSERT OR UPDATE ON public.action_plans FOR EACH ROW EXECUTE FUNCTION public.log_action_plan_changes();

CREATE TRIGGER trg_auto_cancel_drop_on_finalization BEFORE UPDATE ON public.action_plans FOR EACH ROW EXECUTE FUNCTION public.auto_cancel_drop_requests_on_finalization();

CREATE TRIGGER trg_clamp_quality_score BEFORE INSERT OR UPDATE OF quality_score ON public.action_plans FOR EACH ROW EXECUTE FUNCTION public.clamp_quality_score();

CREATE TRIGGER trg_notify_on_escalation AFTER UPDATE ON public.action_plans FOR EACH ROW EXECUTE FUNCTION public.notify_on_escalation();

CREATE TRIGGER trigger_notify_on_status_change AFTER UPDATE ON public.action_plans FOR EACH ROW EXECUTE FUNCTION public.notify_on_status_change();

CREATE TRIGGER trigger_notify_status_change AFTER UPDATE ON public.action_plans FOR EACH ROW EXECUTE FUNCTION public.notify_status_change();

CREATE TRIGGER update_action_plans_updated_at BEFORE UPDATE ON public.action_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER annual_targets_updated_at BEFORE UPDATE ON public.annual_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_dropdown_options_updated_at BEFORE UPDATE ON public.dropdown_options FOR EACH ROW EXECUTE FUNCTION public.update_dropdown_options_updated_at();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_system_settings_timestamp();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "evidence_auth_delete"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'evidence-attachments'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "evidence_auth_update"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'evidence-attachments'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "evidence_auth_upload"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'evidence-attachments'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "evidence_public_read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'evidence-attachments'::text));


CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();

CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();

CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();

CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();

CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();

CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


