const app = require('./app');
const db = require('./db');
require('dotenv').config();

// Inject query count storage into db module (Step 3 profiling)
db.setQueryCountStorage(app.queryCountStorage);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🚀 QuickBite API running on port ${PORT}`);
    console.log(`📂 DB URL: ${process.env.DATABASE_URL ? 'Configured' : 'Missing!'}`);
    console.log(`🛠️ Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log('----------------------------------------------------');
});
