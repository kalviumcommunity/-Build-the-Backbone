const { performance } = require('perf_hooks');

const base = 'http://localhost:3000';

async function timedFetch(url, options = {}) {
  const start = performance.now();
  const res = await fetch(url, options);
  await res.text();
  return { status: res.status, ms: performance.now() - start };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

async function login(email, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token;
}

async function register(email, password) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: email.split('@')[0], email, password }),
  });
  const data = await res.json();
  if (!res.ok && res.status !== 400) throw new Error(`Register failed for ${email}: ${JSON.stringify(data)}`);
}

async function sampleRestaurants() {
  const times = [];
  for (let i = 0; i < 20; i++) {
    const r = await timedFetch(`${base}/api/restaurants?city=Mumbai&limit=20`);
    times.push(r.ms);
  }
  return times;
}

async function sampleHistory(token) {
  const times = [];
  for (let i = 0; i < 20; i++) {
    const r = await timedFetch(`${base}/api/orders/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    times.push(r.ms);
  }
  return times;
}

async function sampleOrders() {
  const times = [];
  for (let i = 0; i < 10; i++) {
    const email = `bench-order-${Date.now()}-${i}@example.com`;
    const password = 'password123';
    await register(email, password);
    const token = await login(email, password);
    const r = await timedFetch(`${base}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        restaurant_id: 1,
        delivery_fee: 40,
        items: [
          { menu_item_id: 1, quantity: 2, price: 250 },
          { menu_item_id: 2, quantity: 1, price: 350 },
        ],
      }),
    });
    times.push(r.ms);
  }
  return times;
}

(async () => {
  const restaurantTimes = await sampleRestaurants();
  const historyToken = await login('user1@example.in', 'password123');
  const historyTimes = await sampleHistory(historyToken);
  const orderTimes = await sampleOrders();

  const summary = {
    restaurants: {
      p50: percentile(restaurantTimes, 0.5),
      p95: percentile(restaurantTimes, 0.95),
      min: Math.min(...restaurantTimes),
      max: Math.max(...restaurantTimes),
      samples: restaurantTimes.map((n) => Number(n.toFixed(2))),
    },
    history: {
      p50: percentile(historyTimes, 0.5),
      p95: percentile(historyTimes, 0.95),
      min: Math.min(...historyTimes),
      max: Math.max(...historyTimes),
      samples: historyTimes.map((n) => Number(n.toFixed(2))),
    },
    orders: {
      p50: percentile(orderTimes, 0.5),
      p95: percentile(orderTimes, 0.95),
      min: Math.min(...orderTimes),
      max: Math.max(...orderTimes),
      samples: orderTimes.map((n) => Number(n.toFixed(2))),
    },
  };

  console.log(JSON.stringify(summary, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
