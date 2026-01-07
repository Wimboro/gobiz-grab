require('dotenv').config();
const D1Client = require('./d1Client');

async function testD1Connection() {
    console.log('🔌 Testing Cloudflare D1 Connection...\n');

    // Initialize D1 Client
    const d1Client = new D1Client(
        process.env.D1_ACCOUNT_ID,
        process.env.D1_DATABASE_ID,
        process.env.D1_API_TOKEN
    );

    try {
        // Test connection
        console.log('1. Testing connection...');
        const connected = await d1Client.testConnection();
        
        if (!connected) {
            throw new Error('Connection test failed');
        }

        // Test query
        console.log('\n2. Testing query...');
        const result = await d1Client.query('SELECT COUNT(*) as count FROM transactions');
        console.log('✅ Query successful');
        console.log('   Current transaction count:', result.results[0]?.count || 0);

        // Test insert
        console.log('\n3. Testing insert...');
        const testTransaction = {
            idPesanan: 'TEST-' + Date.now(),
            tanggalWaktu: new Date().toISOString(),
            idReferensiGopay: '',
            tipePesanan: 'Test',
            tipePembayaran: 'Test',
            penjualanKotor: 'Rp 1.000',
            jumlah: 1000,
            jumlahCents: 100000,
            status: 'Test',
            _amountSource: 'test'
        };

        await d1Client.upsertTransaction(testTransaction);
        console.log('✅ Insert successful');

        // Verify insert
        console.log('\n4. Verifying insert...');
        const verifyResult = await d1Client.query(
            'SELECT * FROM transactions WHERE transaction_id = ? LIMIT 1',
            [testTransaction.idPesanan]
        );
        console.log('✅ Verification successful');
        console.log('   Inserted record:', verifyResult.results[0]);

        // Clean up test data
        console.log('\n5. Cleaning up test data...');
        await d1Client.query('DELETE FROM transactions WHERE transaction_id = ?', [testTransaction.idPesanan]);
        console.log('✅ Cleanup successful');

        console.log('\n✅ All tests passed!');
        console.log('\n📊 D1 Database is ready to use!');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('\nPlease check:');
        console.error('1. D1_ACCOUNT_ID is correct');
        console.error('2. D1_DATABASE_ID is correct');
        console.error('3. D1_API_TOKEN has D1 edit permissions');
        console.error('4. Database tables are created (run d1-setup.sql)');
        process.exit(1);
    }
}

testD1Connection();
