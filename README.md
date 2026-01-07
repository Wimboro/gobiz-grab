# GoBiz Transaction Scraper

A robust Node.js application to scrape and monitor transaction data from GoBiz (GoBiz) Merchant Portal with real-time monitoring and Cloudflare D1 database integration.

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Features

- 🔄 **Real-time Monitoring** - Auto-refresh every 30 seconds
- 💾 **Cloudflare D1 Integration** - Persistent cloud database storage
- 💰 **Accurate Amount Extraction** - API interception for precise transaction amounts
- ⏰ **Precise Timestamps** - ISO 8601 format with timezone support
- 🧹 **Auto Session Cleanup** - Fresh login on every start
- 🛡️ **Error Handling** - Graceful handling of "no transaction" state
- 📊 **Daily Summaries** - Automatic aggregation and reporting

## Quick Start

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- GoBiz (GoBiz) Merchant account
- Cloudflare account (for D1 database)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/wimboro/gobiz-grab.git
   cd gobiz-grab
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your credentials:
   ```env
   # GoBiz Credentials
   GOFOOD_EMAIL=your-email@example.com
   GOFOOD_PASSWORD=your-password
   
   # Browser Settings
   HEADLESS=true
   
   # Cloudflare D1 (optional but recommended)
   D1_ENABLED=true
   D1_ACCOUNT_ID=your-account-id
   D1_DATABASE_ID=your-database-id
   D1_API_TOKEN=your-api-token
   ```

4. **Set up Cloudflare D1** (optional)
   
   See [D1_SETUP_GUIDE.md](D1_SETUP_GUIDE.md) for detailed instructions.
   
   Quick setup:
   ```bash
   # Create database
   npx wrangler d1 create gofood-transactions
   
   # Run schema
   npx wrangler d1 execute gofood-transactions --file=./d1-setup.sql
   
   # Migrate existing database (if upgrading)
   npm run migrate-d1
   ```

5. **Run the scraper**
   ```bash
   npm start
   ```

## Usage

### Available Scripts

```bash
# Start real-time monitor (recommended)
npm start

# One-time scraping
npm run shadowdom          # Shadow DOM workaround
npm run api                # API-based scraper
npm run hybrid             # Hybrid approach

# Database operations
npm run test-d1            # Test D1 connection
npm run migrate-d1         # Migrate database schema

# Utilities
npm run inspect-api        # Inspect journals API structure
```

### Monitor Output Example

```
🚀 Starting GoBiz transaction monitor...
💡 Using API interception for accurate amount data

🧹 Cleaning session and user data...
✅ Session cleanup complete

🌐 Launching browser...
🔐 Performing fresh login...
✅ Login successful!

🔄 Starting auto-refresh every 30 seconds...
Press Ctrl+C to stop

📊 [07/01/2026, 11.30.00] Loading initial transactions...
✅ Found 5 transactions
💰 Amount data captured: 5/5 transactions
💰 Total: Rp 250.000
💾 Data saved to transactions_latest.json

💾 Saving to Cloudflare D1 database...
✅ D1: Saved 5 transactions
✅ D1: Daily summary updated

📋 Recent transactions:
  1. 07/01/2026, 11.25.30 - QRIS-... - Rp 50.000 (Settlement)
  2. 07/01/2026, 11.20.15 - QRIS-... - Rp 50.000 (Settlement)
  3. 07/01/2026, 11.15.45 - QRIS-... - Rp 50.000 (Settlement)
  4. 07/01/2026, 11.10.20 - QRIS-... - Rp 50.000 (Settlement)
  5. 07/01/2026, 11.05.10 - QRIS-... - Rp 50.000 (Settlement)
```

## Architecture

### Hybrid Approach

The scraper uses a hybrid approach combining Puppeteer and API interception:

1. **Puppeteer** handles authentication and page loading
2. **API Interception** captures JSON responses from the browser
3. **Data Merging** combines DOM data with API data for complete information
4. **Database Storage** saves to Cloudflare D1 for persistent storage

### Why Not Pure API?

Pure API approach was investigated but not recommended because:
- ❌ Requires complex authorization headers
- ❌ High maintenance overhead
- ❌ Fragile and breaks with API changes
- ❌ Minimal performance gain (~7.5 seconds)

See [DIRECT_API_NOTES.md](DIRECT_API_NOTES.md) for detailed analysis.

## 📊 Database Schema

```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT UNIQUE NOT NULL,
    tanggal_waktu TEXT,
    transaction_time TEXT,           -- ISO 8601 timestamp
    id_pesanan TEXT,
    id_referensi_gopay TEXT,
    tipe_pesanan TEXT,
    tipe_pembayaran TEXT,
    penjualan_kotor TEXT,
    jumlah REAL,                      -- Amount in Rupiah
    jumlah_cents INTEGER,             -- Amount in cents
    status TEXT,
    amount_source TEXT,
    scraped_at TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE daily_summary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE NOT NULL,
    total_transactions INTEGER DEFAULT 0,
    total_amount REAL DEFAULT 0,
    total_amount_cents INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOFOOD_EMAIL` | Yes | - | Your GoBiz merchant email |
| `GOFOOD_PASSWORD` | Yes | - | Your GoBiz merchant password |
| `HEADLESS` | No | `true` | Run browser in headless mode |
| `D1_ENABLED` | No | `false` | Enable Cloudflare D1 integration |
| `D1_ACCOUNT_ID` | If D1 enabled | - | Cloudflare account ID |
| `D1_DATABASE_ID` | If D1 enabled | - | D1 database ID |
| `D1_API_TOKEN` | If D1 enabled | - | Cloudflare API token |

### Browser Settings

Edit `scrapeTransactionsMonitor.js` to customize:

```javascript
const CONFIG = {
    refreshInterval: 30000,  // Refresh every 30 seconds
    timeout: 30000,          // Request timeout
    headless: true,          // Run in headless mode
    // ... other settings
};
```

## Documentation

## Troubleshooting

### Login Failed

**Error:** `❌ Login failed! Please check your credentials.`

**Solution:**
1. Verify email and password in `.env`
2. Check if account is active
3. Try manual login on GoBiz portal
4. Check for CAPTCHA or 2FA requirements

### No Transactions Found

**Error:** `ℹ️  No transactions found (Belum ada transaksi)`

**Solution:**
- This is normal if there are no transactions today
- Script will continue monitoring and auto-detect when transactions appear
- Check GoBiz portal manually to verify

### D1 Connection Failed

**Error:** `❌ D1 Database connection failed`

**Solution:**
1. Verify D1 credentials in `.env`
2. Check database exists in Cloudflare dashboard
3. Ensure API token has D1 read/write permissions
4. Run `npm run test-d1` to diagnose

### Browser Timeout

**Error:** `Navigation timeout of 30000 ms exceeded`

**Solution:**
1. Check internet connection
2. Increase timeout in config
3. Try running with `HEADLESS=false` to see what's happening

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## ⚠️ Disclaimer

This tool is for educational and personal use only. Please ensure you comply with GoBiz's Terms of Service when using this scraper. The authors are not responsible for any misuse or violations.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Puppeteer](https://pptr.dev/) - Headless browser automation
- [Cloudflare D1](https://developers.cloudflare.com/d1/) - Serverless SQL database
- [Axios](https://axios-http.com/) - HTTP client

## 📞 Support

If you encounter any issues or have questions:

1. Check the [documentation](#-documentation)
2. Search [existing issues](https://github.com/wimboro/gobiz-grab/issues)
3. Create a [new issue](https://github.com/wimboro/gobiz-grab/issues/new)

## 🗺️ Roadmap

- [ ] Add support for date range selection
- [ ] Implement export to CSV/Excel
- [ ] Add web dashboard for visualization
- [ ] Support for multiple merchant accounts
- [ ] Add notification system (email/webhook)
- [ ] Implement data analytics and insights

---

Made with ❤️ for GoBiz merchants
