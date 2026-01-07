/**
 * Cloudflare D1 Database Client
 * Handles all database operations for transaction storage
 */

const fetch = require('node-fetch');

class D1Client {
    constructor(accountId, databaseId, apiToken) {
        this.accountId = accountId;
        this.databaseId = databaseId;
        this.apiToken = apiToken;
        this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}`;
    }

    /**
     * Execute a SQL query on D1 database
     */
    async query(sql, params = []) {
        try {
            const response = await fetch(`${this.baseUrl}/query`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sql,
                    params
                })
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`D1 Query failed: ${response.status} - ${error}`);
            }

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(`D1 Query error: ${JSON.stringify(result.errors)}`);
            }

            return result.result[0];
        } catch (error) {
            console.error('❌ D1 Query Error:', error.message);
            throw error;
        }
    }

    /**
     * Insert or update a transaction
     */
    async upsertTransaction(transaction) {
        const sql = `
            INSERT INTO transactions (
                transaction_id, tanggal_waktu, transaction_time, id_pesanan, id_referensi_gopay,
                tipe_pesanan, tipe_pembayaran, penjualan_kotor, jumlah,
                jumlah_cents, status, amount_source, scraped_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(transaction_id) DO UPDATE SET
                tanggal_waktu = excluded.tanggal_waktu,
                transaction_time = excluded.transaction_time,
                id_pesanan = excluded.id_pesanan,
                id_referensi_gopay = excluded.id_referensi_gopay,
                tipe_pesanan = excluded.tipe_pesanan,
                tipe_pembayaran = excluded.tipe_pembayaran,
                penjualan_kotor = excluded.penjualan_kotor,
                jumlah = excluded.jumlah,
                jumlah_cents = excluded.jumlah_cents,
                status = excluded.status,
                amount_source = excluded.amount_source,
                scraped_at = excluded.scraped_at,
                updated_at = CURRENT_TIMESTAMP
        `;

        const params = [
            transaction.idPesanan,
            transaction.tanggalWaktu,
            transaction.transactionTime || null,
            transaction.idPesanan,
            transaction.idReferensiGopay,
            transaction.tipePesanan,
            transaction.tipePembayaran,
            transaction.penjualanKotor,
            transaction.jumlah,
            transaction.jumlahCents || 0,
            transaction.status,
            transaction._amountSource || 'unknown',
            new Date().toISOString()
        ];

        return await this.query(sql, params);
    }

    /**
     * Batch insert/update multiple transactions
     */
    async upsertTransactions(transactions) {
        console.log(`💾 Saving ${transactions.length} transactions to D1...`);
        
        let successCount = 0;
        let errorCount = 0;

        for (const transaction of transactions) {
            try {
                await this.upsertTransaction(transaction);
                successCount++;
            } catch (error) {
                console.error(`❌ Failed to save transaction ${transaction.idPesanan}:`, error.message);
                errorCount++;
            }
        }

        console.log(`✅ Saved: ${successCount}, ❌ Failed: ${errorCount}`);
        return { successCount, errorCount };
    }

    /**
     * Update daily summary
     */
    async updateDailySummary(date, totalTransactions, totalAmount, totalAmountCents) {
        const sql = `
            INSERT INTO daily_summary (date, total_transactions, total_amount, total_amount_cents, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(date) DO UPDATE SET
                total_transactions = excluded.total_transactions,
                total_amount = excluded.total_amount,
                total_amount_cents = excluded.total_amount_cents,
                updated_at = CURRENT_TIMESTAMP
        `;

        const params = [date, totalTransactions, totalAmount, totalAmountCents];
        return await this.query(sql, params);
    }

    /**
     * Get transactions for a specific date
     */
    async getTransactionsByDate(date) {
        const sql = `
            SELECT * FROM transactions 
            WHERE DATE(created_at) = ? 
            ORDER BY created_at DESC
        `;
        return await this.query(sql, [date]);
    }

    /**
     * Get daily summary
     */
    async getDailySummary(date) {
        const sql = `SELECT * FROM daily_summary WHERE date = ?`;
        return await this.query(sql, [date]);
    }

    /**
     * Get total count of transactions
     */
    async getTotalCount() {
        const sql = `SELECT COUNT(*) as count FROM transactions`;
        const result = await this.query(sql);
        return result.results[0]?.count || 0;
    }

    /**
     * Test database connection
     */
    async testConnection() {
        try {
            const sql = `SELECT 1 as test`;
            await this.query(sql);
            console.log('✅ D1 Database connection successful');
            return true;
        } catch (error) {
            console.error('❌ D1 Database connection failed:', error.message);
            return false;
        }
    }
}

module.exports = D1Client;
