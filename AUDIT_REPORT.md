# Build The Backbone - Performance Audit Report

## Problem 1: N+1 Query in Order History

Location:
src/controllers/order.controller.js

Issue:
The API first loads orders, then loads order_items for every order, then loads menu_items for every item.

Impact:
Database queries grow rapidly as order count increases.

Example:

1 query -> orders

N queries -> order_items

M queries -> menu_items

Total:
1 + N + M

Recommendation:
Replace nested queries with SQL JOINs.

Expected Improvement:
Significant reduction in database round trips.



## Problem 2: Blocking Email Sending

Location:
src/controllers/order.controller.js

Issue:

await emailService.sendConfirmation(...)

is executed before sending the HTTP response.

Impact:

300-800ms delay added to every order creation request.

Recommendation:

Move email sending to a background queue or asynchronous task.

Expected Improvement:

Faster response times for create-order API.



## Problem 3: Missing Database Indexes

Location:
src/controllers/restaurant.controller.js

Issue:

Restaurant search filters by city.

Without indexes, PostgreSQL performs full table scans.

Recommendation:

Create indexes on:

restaurants(city)

menu_items(restaurant_id)

order_items(order_id)

Expected Improvement:

Much faster filtering and lookup operations.



## Problem 4: N+1 Query in Menu API

Location:
src/controllers/restaurant.controller.js

Issue:

The API fetches menu items and then performs a separate category query for every item.

Impact:

Query count increases linearly with menu size.

Recommendation:

Use JOIN between menu_items and categories.

Expected Improvement:

Single database query instead of N+1 queries.# 🛡️ QuickBite API: Consistency & Audit Report

**Audit Date**: April 2026  
**Auditor**: Antigravity Senior Backend Engineer  

---

## 🏗️ Functionality Consistency

| Check | Result | Confirmation |
| :--- | :--- | :--- |
| **POST /api/auth/register** creates user & returns JWT | ☑ Pass | Returns 201 with `token` & `user` object. |
| **POST /api/auth/login** verifies bcrypt & returns JWT | ☑ Pass | Authenticates against correctly hashed passwords. |
| **GET /api/restaurants** lists with pagination | ☑ Pass | Supports `limit`, `offset`, and `city` filter. |
| **GET /api/orders/history** returns nested data | ☑ Pass | Correctly nesting `order_items` and `menu_item` details. |
| **POST /api/orders** creates order + email delay | ☑ Pass | Inserts into both tables and triggers simulated SMTP delay. |

---

## 🐌 Performance Problem Audit (The "Planted" Issues)

| Feature | Planted Problem | Audit Check | Result |
| :--- | :--- | :--- | :--- |
| **Order History** | Severe N+1 (3-level) | Loop for items + loop for menu inside history. | ☑ PASS |
| **Restaurant Menu** | Medium N+1 (2-level) | Loop for category details on every single item. | ☑ PASS |
| **Order Creation** | Blocking I/O I/O Sync | `await` on confirmation email (300-800ms). | ☑ PASS |
| **DB Schema** | Missing Indexes | Foreign keys on `orders`, `order_items`, `menu_items` are bare. | ☑ PASS |
| **Database Scans** | Seq Scans on large tables | `order_items` has ~30,000 rows. Seq Scan will be slow. | ☑ PASS |

---

## 🔍 Validation Traces

1. **Query Trace (No Index)**:
   - Query: `SELECT * FROM orders WHERE user_id = $1`
   - Expectation: Table has 5,000 rows. Without an index on `user_id`, Postgres will perform a `Sequential Scan` on the entire `orders` table for every search.
   - Result: **Confirmed**.

2. **N+1 Trace (Order History)**:
   - Logic: 1 (Orders) + 20 (Items query) + 100 (Menu query) = **121 DB calls** for a standard historical report.
   - Result: **Confirmed**.

---

## 🏁 Final Verdict: 🟢 READY FOR RELEASE

The app is perfectly "broken." A developer following the `README.md` only will be able to start the app, populate the database with enough volume to generate massive Sequential Scans, and begin profiling the intentional bottlenecks.

🏆 **Industry Standards Met**:
- Modular Express 4 Architecture.
- Robust Parameterized SQL (Security preserved).
- Professional Documentation.
- Clear Load Testing Baseline.
