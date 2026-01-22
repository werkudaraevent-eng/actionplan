# Werkudara Group - Department Action Plan Tracking System

A production-ready web application for tracking departmental action plans with role-based access control.

## Tech Stack

- **Frontend:** React (Vite), Tailwind CSS, Lucide Icons
- **Backend:** Supabase (Auth, Database, Row Level Security)

## Setup Instructions

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from Settings > API

### 2. Setup Database

1. Go to SQL Editor in your Supabase dashboard
2. Follow the [Migration Guide](./docs/migrations/README.md) for proper migration order
3. Start with `docs/migrations/supabase-schema.sql` to create tables and RLS policies
4. (Optional) Run `docs/migrations/supabase-seed.sql` to add sample data
5. Apply additional migrations as needed (see migration guide)

### 3. Create Test Users

In Supabase Dashboard > Authentication > Users, create users with metadata:

**Admin User:**
```json
{
  "full_name": "Admin User",
  "role": "admin",
  "department_code": null
}
```

**Department Head (e.g., Sales Operation):**
```json
{
  "full_name": "SO Department Head",
  "role": "dept_head",
  "department_code": "SO"
}
```

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Install & Run

```bash
npm install
npm run dev
```

## Features

### Role-Based Access Control

| Feature | Admin | Dept Head |
|---------|-------|-----------|
| View all departments | ✅ | ❌ |
| View own department | ✅ | ✅ |
| Create action plans | ✅ | ❌ |
| Edit all fields | ✅ | ❌ |
| Edit status/outcome/remark | ✅ | ✅ |
| Delete action plans | ✅ | ❌ |
| Company dashboard | ✅ | ❌ |

### Security (RLS Policies)

- **Admins:** Full CRUD access to all action plans
- **Dept Heads:** 
  - Can only SELECT rows matching their department
  - Can only UPDATE status, outcome_link, and remark columns
  - Cannot INSERT or DELETE

### Departments

| Code | Name |
|------|------|
| BAS | Business & Administration Services |
| PD | Product Development |
| CFC | Corporate Finance Controller |
| SS | Strategic Sourcing |
| ACC | Accounting |
| HR | Human Resources |
| BID | Business & Innovation Development |
| TEP | Tour and Event Planning |
| GA | General Affairs |
| ACS | Art & Creative Support |
| SO | Sales Operation |

## Project Structure

```
action-plan-tracker/
├── docs/                       # 📚 Documentation
│   ├── README.md              # Documentation index
│   ├── fixes/                 # Bug fixes & features
│   │   ├── README.md         # Fixes index
│   │   ├── AUDIT-*.md        # Audit trail improvements
│   │   ├── MULTI-*.md        # Multi-department features
│   │   ├── SLIDER-*.md       # UI fixes
│   │   └── ...
│   └── migrations/            # Database migrations
│       ├── README.md         # Migration guide
│       ├── supabase-schema.sql
│       ├── supabase-seed.sql
│       └── ...
├── src/
│   ├── components/
│   │   ├── LoginPage.jsx
│   │   ├── LoadingScreen.jsx
│   │   ├── Sidebar.jsx
│   │   ├── AdminDashboard.jsx
│   │   ├── DepartmentView.jsx
│   │   ├── DashboardCards.jsx
│   │   ├── DataTable.jsx
│   │   └── ActionPlanModal.jsx
│   ├── context/
│   │   └── AuthContext.jsx
│   ├── hooks/
│   │   └── useActionPlans.js
│   ├── lib/
│   │   └── supabase.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env
├── package.json
└── README.md
```

## 📚 Documentation

All documentation has been organized in the `docs/` directory:

- **[Documentation Index](./docs/README.md)** - Start here for all documentation
- **[Bug Fixes & Features](./docs/fixes/README.md)** - UI improvements and feature docs
- **[Database Migrations](./docs/migrations/README.md)** - SQL migration scripts and guide

### Quick Links
- [Audit Trail Improvements](./docs/fixes/AUDIT-ACTOR-FIX.md)
- [Multi-Department Features](./docs/fixes/MULTI-DEPARTMENT-IMPLEMENTATION.md)
- [Migration Order Guide](./docs/migrations/README.md#-migration-order)
- [Troubleshooting](./docs/fixes/AUDIT-ACTOR-TROUBLESHOOTING.md)

## License

Private - Werkudara Group
