require('dotenv').config();
const fetch = require('node-fetch');

const D1_ACCOUNT_ID = process.env.D1_ACCOUNT_ID;
const D1_DATABASE_ID = process.env.D1_DATABASE_ID;
const D1_API_TOKEN = process.env.D1_API_TOKEN;

const D1_API_BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}`;

async function query(sql) {
    if (!D1_ACCOUNT_ID || !D1_DATABASE_ID || !D1_API_TOKEN) {
        throw new Error('❌ D1 credentials missing. Please check .env file');
    }

    try {
        const response = await fetch(`${D1_API_BASE_URL}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${D1_API_TOKEN}`
            },
            body: JSON.stringify({ sql })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('❌ D1 Query Error:', data.errors || data);
            return { success: false, error: data.errors || data };
        }

        return { success: true, results: data.result };
    } catch (error) {
        console.error('❌ D1 Fetch Error:', error.message);
        return { success: false, error: error.message };
    }
}

async function migrateDatabase() {
    console.log('🔄 Starting D1 database migration...\n');

    try {
        // Step 1: Check if transaction_time column exists
        console.log('1️⃣  Checking current table structure...');
        const checkResult = await query(`PRAGMA table_info(transactions);`);
        
        if (!checkResult.success) {
            throw new Error('Failed to check table structure');
        }

        const columns = checkResult.results[0]?.results || [];
        const hasTransactionTime = columns.some(col => col.name === 'transaction_time');

        if (hasTransactionTime) {
            console.log('✅ Column "transaction_time" already exists!\n');
            console.log('ℹ️  No migration needed. Database is up to date.');
            return;
        }

        console.log('⚠️  Column "transaction_time" not found. Adding it...\n');

        // Step 2: Add transaction_time column
        console.log('2️⃣  Adding transaction_time column...');
        const alterResult = await query(`
            ALTER TABLE transactions 
            ADD COLUMN transaction_time TEXT;
        `);

        if (!alterResult.success) {
            throw new Error('Failed to add transaction_time column');
        }

        console.log('✅ Column added successfully!\n');

        // Step 3: Create index for better performance
        console.log('3️⃣  Creating index on transaction_time...');
        const indexResult = await query(`
            CREATE INDEX IF NOT EXISTS idx_transaction_time 
            ON transactions(transaction_time);
        `);

        if (!indexResult.success) {
            throw new Error('Failed to create index');
        }

        console.log('✅ Index created successfully!\n');

        // Step 4: Verify the changes
        console.log('4️⃣  Verifying table structure...');
        const verifyResult = await query(`PRAGMA table_info(transactions);`);
        
        if (verifyResult.success) {
            const updatedColumns = verifyResult.results[0]?.results || [];
            console.log('\n📋 Current table columns:');
            updatedColumns.forEach(col => {
                const marker = col.name === 'transaction_time' ? '✅ NEW' : '';
                console.log(`   - ${col.name} (${col.type}) ${marker}`);
            });
        }

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📊 Summary:');
        console.log('   ✓ Added transaction_time column (TEXT)');
        console.log('   ✓ Created index for better query performance');
        console.log('   ✓ Database is ready for precise timestamps');
        console.log('\n🚀 You can now run: npm start');

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('\n💡 Troubleshooting:');
        console.error('   1. Check your D1 credentials in .env');
        console.error('   2. Verify database exists in Cloudflare dashboard');
        console.error('   3. Ensure API token has correct permissions');
        throw error;
    }
}

if (require.main === module) {
    migrateDatabase()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('\n💥 Migration error:', error);
            process.exit(1);
        });
}

module.exports = migrateDatabase;
