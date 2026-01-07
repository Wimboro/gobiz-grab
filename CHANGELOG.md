# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-07

### Added
- 🎉 Initial public release
- Real-time transaction monitoring with auto-refresh
- Cloudflare D1 database integration
- Precise transaction time extraction (ISO 8601)
- API interception for accurate amount data
- Auto session cleanup on startup
- Graceful handling of "no transaction" state
- Daily summary aggregation
- Database migration tool
- API inspection utility
- Comprehensive documentation

### Features
- **Monitor Script** (`scrapeTransactionsMonitor.js`)
  - Auto-refresh every 30 seconds
  - Real-time console output
  - Saves to D1 database
  - Handles authentication automatically
  
- **Alternative Scrapers**
  - Shadow DOM workaround scraper
  - API-based scraper
  - Hybrid approach scraper
  
- **Database Integration**
  - Cloudflare D1 support
  - Automatic schema migration
  - Daily summary tables
  - Transaction history

- **Utilities**
  - D1 connection tester
  - API structure inspector
  - Database migration tool

### Documentation
- Complete README with quick start guide
- D1 setup guide with step-by-step instructions
- Database migration guide
- Transaction time feature documentation
- Shadow DOM issue explanation
- Direct API investigation notes
- Project structure overview
- Contributing guidelines
- MIT License

### Technical Details
- **Amount Extraction**: Converts cents to Rupiah (÷100)
- **Timestamp Format**: ISO 8601 with UTC timezone
- **Session Management**: Fresh login on every start
- **Error Handling**: Graceful degradation
- **File Storage**: Only `transactions_latest.json` (no history files)

## [Unreleased]

### Planned Features
- Date range selection
- Export to CSV/Excel
- Web dashboard for visualization
- Multiple merchant account support
- Email/webhook notifications
- Data analytics and insights
- Docker support
- CI/CD pipeline

### Known Issues
- None currently

## Version History

### [1.0.0] - 2026-01-07
- Initial public release

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute to this project.

## Support

For issues and questions, please visit:
- [GitHub Issues](https://github.com/wimboro/gobiz-transaction-scraper/issues)
- [Documentation](README.md)
