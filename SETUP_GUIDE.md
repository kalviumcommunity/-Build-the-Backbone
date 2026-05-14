# 🚀 Build the Backbone - Part A Setup Guide

## ⚠️ Prerequisites: PostgreSQL Installation

Before running this assignment, you must have PostgreSQL 14+ installed and running on your machine.

### For Windows:

#### Option 1: PostgreSQL Installer (Recommended)
1. Download from https://www.postgresql.org/download/windows/
2. Run the installer and remember the password you set for the `postgres` superuser
3. Ensure PostgreSQL is set to start automatically
4. Verify installation:
   ```bash
   psql --version
   ```

#### Option 2: PostgreSQL via Chocolatey
```bash
choco install postgresql
# Set password when prompted
```

---

## 🔧 Configure Database Connection

### Step 1: Verify PostgreSQL is Running
```bash
# On Windows, PostgreSQL should auto-start
# Check Services (Services.msc) for "PostgreSQL <version>" service

# Or test connection:
psql -U postgres -h localhost -c "SELECT version();"
```

### Step 2: Set PostgreSQL Password (If Needed)
If you forgot the postgres password or need to reset it:

```bash
# Login without password (if pg_hba.conf allows):
psql -U postgres

# Then in psql, set password:
ALTER ROLE postgres WITH PASSWORD 'postgres';
\q
```

### Step 3: Update .env File
Edit `.env` in the project root:
```bash
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/quickbite
```

Replace `YOUR_PASSWORD` with your PostgreSQL password.

---

## 📋 Run Database Setup

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Create Database and Run Migrations
```bash
# This will create the 'quickbite' database and run migrations
node setup-db.js
```

**Expected Output:**
```
📦 Starting database setup...
🔗 Connecting to PostgreSQL...
✅ Connected as postgres
📚 Creating/checking quickbite database...
✅ Database quickbite already exists
⚙️  Running migrations/001_create_tables.sql...
✅ Completed migrations/001_create_tables.sql
⚙️  Running migrations/002_seed_data.sql...
✅ Completed migrations/002_seed_data.sql
✨ Database setup complete!
📊 Schema and seed data ready for performance testing
```

### Step 3: Start the Development Server
```bash
npm run dev
```

You should see:
```
🚀 QuickBite API running on port 3000
📂 DB URL: Configured
🛠️ Mode: development
```

---

## 📊 Run Part A Assignment

### Step 1: Create Artillery Configuration
Artillery baseline config is already in `artillery-baseline.yml`

### Step 2: Start Performance Testing Sequence

#### Terminal 1: Start Server
```bash
npm run dev
```

#### Terminal 2: Run Artillery Baseline
```bash
# Install artillery globally (if not already)
npm install -g artillery

# Run baseline test
artillery run artillery-baseline.yml --output baseline-results.json

# Generate report
artillery report baseline-results.json
```

**Record the metrics** in PROFILING.md:
- P50, P95, P99 response times
- Error rates
- Throughput

### Step 3: Enable Query Counting
```
# Already configured - watch server terminal for [SLOW] messages
# When you see: [SLOW] GET /api/orders/history made 101 DB queries
# Record this in PROFILING.md
```

### Step 4: Run EXPLAIN ANALYZE
Open a PostgreSQL client and run:

```sql
-- Connect to quickbite database
psql -U postgres -d quickbite

-- Query 1: Orders by user
EXPLAIN ANALYZE
SELECT * FROM orders WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20;

-- Copy the output to PROFILING.md

-- Query 2: Order items by order
EXPLAIN ANALYZE
SELECT * FROM order_items WHERE order_id = 7;

-- Query 3: Menu items by restaurant
EXPLAIN ANALYZE
SELECT * FROM menu_items WHERE restaurant_id = 1 AND available = TRUE;
```

### Step 5: Run Indexes Migration
```sql
psql -U postgres -d quickbite -f migrations/003_add_performance_indexes.sql
```

### Step 6: Re-run EXPLAIN ANALYZE
Run the same 3 queries again and record the improvements

### Step 7: Run Artillery After Fixes
```bash
artillery run artillery-baseline.yml --output after-fixes-results.json
artillery report after-fixes-results.json
```

Compare P50 and P95 values with baseline

---

## 📝 Troubleshooting

### Error: "password authentication failed for user postgres"
- Check PostgreSQL password is correct in .env
- Try: `psql -U postgres -h localhost -c "SELECT 1;"`
- If that fails, reset password:
  ```bash
  # Windows: Use PostgreSQL Stack Builder or pg_ctl
  psql -U postgres -c "ALTER ROLE postgres WITH PASSWORD 'newpassword';"
  ```

### Error: "Could not connect to PostgreSQL with any configuration"
- Verify PostgreSQL service is running
- Windows: Services.msc → search "PostgreSQL" → Start the service
- Check `localhost:5432` is accessible

### Error: "database 'quickbite' does not exist"
- Run: `node setup-db.js` to create it

### Error: "relation 'orders' does not exist"
- Migrations failed; check output of `node setup-db.js`

---

## ✅ Verification Checklist

- [ ] PostgreSQL installed and running
- [ ] .env file configured with PostgreSQL credentials
- [ ] `node setup-db.js` completed successfully
- [ ] `npm run dev` server running on port 3000
- [ ] Can call `GET /api/health` and get `{"status":"UP"}`
- [ ] Artillery baseline report generated
- [ ] Query counts recorded in PROFILING.md
- [ ] EXPLAIN ANALYZE outputs captured (before indexes)
- [ ] Indexes migration applied
- [ ] EXPLAIN ANALYZE re-run (after indexes)
- [ ] Artillery after-fix report generated
- [ ] All metrics documented in PROFILING.md

---

## 📚 Additional Resources

- [PostgreSQL Manual](https://www.postgresql.org/docs/current/)
- [EXPLAIN ANALYZE Guide](https://www.postgresql.org/docs/current/sql-explain.html)
- [Artillery Documentation](https://artillery.io/docs)
- [JSON Aggregation in PostgreSQL](https://www.postgresql.org/docs/current/functions-aggregate.html)

---

## 🎯 Assignment Submission

When ready to submit:

1. **Record PR metrics** in PROFILING.md (copy-paste EXPLAIN ANALYZE, Artillery results)
2. **Create GitHub PR** with branch `backbone` → `main`
3. **Record video** (3-5 min) showing:
   - EXPLAIN ANALYZE before/after
   - N+1 code fix explanation
   - Query count reduction proof
4. **Submit**:
   - GitHub PR link
   - Google Drive video link (Anyone with link can view)

Good luck! 🚀
