# Contributing to GoBiz Transaction Scraper

First off, thank you for considering contributing to GoBiz Transaction Scraper! It's people like you that make this tool better for everyone.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

**Bug Report Template:**

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment:**
 - OS: [e.g. Ubuntu 22.04]
 - Node.js version: [e.g. 18.0.0]
 - npm version: [e.g. 9.0.0]

**Additional context**
Add any other context about the problem here.
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- A clear and descriptive title
- A detailed description of the proposed functionality
- Explain why this enhancement would be useful
- List any alternative solutions you've considered

### Pull Requests

1. **Fork the repository** and create your branch from `main`
   ```bash
   git checkout -b feature/AmazingFeature
   ```

2. **Make your changes**
   - Write clear, commented code
   - Follow the existing code style
   - Add tests if applicable

3. **Test your changes**
   ```bash
   npm test
   npm run lint
   ```

4. **Commit your changes**
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```
   
   Use clear and meaningful commit messages:
   - `feat: add new feature`
   - `fix: resolve bug in scraper`
   - `docs: update README`
   - `refactor: improve code structure`
   - `test: add unit tests`

5. **Push to your fork**
   ```bash
   git push origin feature/AmazingFeature
   ```

6. **Open a Pull Request**
   - Provide a clear description of the changes
   - Reference any related issues
   - Include screenshots if applicable

## Development Setup

1. **Clone your fork**
   ```bash
   git clone https://github.com/your-username/gobiz-transaction-scraper.git
   cd gobiz-transaction-scraper
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

4. **Run tests**
   ```bash
   npm test
   ```

## Code Style Guidelines

### JavaScript

- Use ES6+ features
- Use `const` and `let`, avoid `var`
- Use async/await instead of callbacks
- Add JSDoc comments for functions
- Keep functions small and focused

**Example:**

```javascript
/**
 * Extract transaction data from page
 * @param {Page} page - Puppeteer page object
 * @param {Array} apiResponses - Captured API responses
 * @returns {Promise<Array>} Array of transaction objects
 */
async function extractTransactions(page, apiResponses) {
    // Implementation
}
```

### File Organization

- One feature per file
- Group related functionality
- Use descriptive file names
- Keep files under 500 lines

### Documentation

- Update README.md for user-facing changes
- Add/update JSDoc comments
- Create/update technical documentation in docs/
- Include examples in documentation

## Testing

- Write tests for new features
- Ensure existing tests pass
- Test with different configurations
- Test error handling

## Project Structure

```
gobiz-transaction-scraper/
├── scrapeTransactionsMonitor.js    # Main monitor script
├── scrapeTransactionsShadowDOM.js  # Shadow DOM workaround
├── scrapeTransactionsAPI.js        # API-based scraper
├── d1Client.js                     # D1 database client
├── d1-setup.sql                    # Database schema
├── testD1.js                       # D1 connection test
├── docs/                           # Documentation
│   ├── D1_SETUP_GUIDE.md
│   ├── TRANSACTION_TIME_FEATURE.md
│   └── ...
├── .env.example                    # Environment template
├── package.json                    # Dependencies
└── README.md                       # Main documentation
```

## Areas for Contribution

### High Priority

- [ ] Add unit tests
- [ ] Improve error handling
- [ ] Add retry logic for failed requests
- [ ] Optimize performance

### Medium Priority

- [ ] Add date range selection
- [ ] Export to CSV/Excel
- [ ] Web dashboard
- [ ] Email notifications

### Low Priority

- [ ] Docker support
- [ ] CI/CD pipeline
- [ ] Multiple merchant accounts
- [ ] Data analytics

## Questions?

Feel free to:
- Open an issue with the `question` label
- Start a discussion in GitHub Discussions
- Reach out to maintainers

## Recognition

Contributors will be:
- Listed in README.md
- Mentioned in release notes
- Given credit in commit history

Thank you for contributing! 🎉
