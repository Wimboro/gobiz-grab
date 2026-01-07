-- Cloudflare D1 Database Setup
-- Run this SQL to create the transactions table

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    tanggal_waktu TEXT,
    transaction_time TEXT,
    id_pesanan TEXT,
    id_referensi_gopay TEXT,
    tipe_pesanan TEXT,
    tipe_pembayaran TEXT,
    penjualan_kotor TEXT,
    jumlah REAL,
    jumlah_cents INTEGER,
    status TEXT,
    amount_source TEXT,
    scraped_at TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_transaction_id ON transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_scraped_at ON transactions(scraped_at);
CREATE INDEX IF NOT EXISTS idx_created_at ON transactions(created_at);

-- Create a summary table for daily totals
CREATE TABLE IF NOT EXISTS daily_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    total_transactions INTEGER DEFAULT 0,
    total_amount REAL DEFAULT 0,
    total_amount_cents INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_date ON daily_summary(date);
