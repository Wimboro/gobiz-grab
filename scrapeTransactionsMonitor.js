require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const D1Client = require('./d1Client');

// Configuration
const CONFIG = {
    loginUrl: 'https://portal.gofoodmerchant.co.id/auth/login/email',
    transactionsUrl: 'https://portal.gofoodmerchant.co.id/transactions?date_range=today',
    email: process.env.GOFOOD_EMAIL,
    password: process.env.GOFOOD_PASSWORD,
    headless: process.env.HEADLESS === 'true',
    timeout: 30000,
    refreshInterval: 30000, // 30 seconds
    sessionFile: path.join(__dirname, 'session.json'),
    userDataDir: path.join(__dirname, 'user_data'), // Persistent browser data
    // D1 Database
    d1Enabled: process.env.D1_ENABLED === 'true',
    d1AccountId: process.env.D1_ACCOUNT_ID,
    d1DatabaseId: process.env.D1_DATABASE_ID,
    d1ApiToken: process.env.D1_API_TOKEN
};

// Initialize D1 Client if enabled
let d1Client = null;
if (CONFIG.d1Enabled) {
    if (!CONFIG.d1AccountId || !CONFIG.d1DatabaseId || !CONFIG.d1ApiToken) {
        console.warn('⚠️  D1 enabled but credentials missing. Please check .env file');
    } else {
        d1Client = new D1Client(CONFIG.d1AccountId, CONFIG.d1DatabaseId, CONFIG.d1ApiToken);
        console.log('✅ D1 Client initialized');
    }
}

/**
 * Save session data to file
 */
async function saveSession(page) {
    try {
        const cookies = await page.cookies();
        const localStorage = await page.evaluate(() => {
            const data = {};
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                data[key] = window.localStorage.getItem(key);
            }
            return data;
        });

        const sessionData = {
            cookies,
            localStorage,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(CONFIG.sessionFile, JSON.stringify(sessionData, null, 2));
        console.log('💾 Session saved');
    } catch (error) {
        console.error('⚠️  Failed to save session:', error.message);
    }
}

/**
 * Load session data from file
 */
async function loadSession(page) {
    try {
        if (!fs.existsSync(CONFIG.sessionFile)) {
            console.log('ℹ️  No saved session found');
            return false;
        }

        const sessionData = JSON.parse(fs.readFileSync(CONFIG.sessionFile, 'utf8'));

        // Check if session is not too old (24 hours)
        const sessionAge = Date.now() - new Date(sessionData.timestamp).getTime();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        if (sessionAge > maxAge) {
            console.log('ℹ️  Session expired, logging in again');
            return false;
        }

        // Restore cookies
        if (sessionData.cookies && sessionData.cookies.length > 0) {
            await page.setCookie(...sessionData.cookies);
        }

        // Restore localStorage
        if (sessionData.localStorage) {
            await page.evaluate((data) => {
                for (const [key, value] of Object.entries(data)) {
                    window.localStorage.setItem(key, value);
                }
            }, sessionData.localStorage);
        }

        console.log('✅ Session restored');
        return true;
    } catch (error) {
        console.error('⚠️  Failed to load session:', error.message);
        return false;
    }
}

/**
 * Perform login
 */
async function performLogin(page) {
    console.log('🔐 Performing login...');

    // Navigate to login page
    console.log('📧 Navigating to email login page...');
    await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

    // Handle cookie consent popup
    try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const cookieClicked = await page.evaluate(() => {
            const buttonTexts = ['Terima Semua Cookie', 'Terima Semua', 'Accept All', 'Accept', 'Terima', 'Setuju', 'OK'];
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const button of buttons) {
                const text = button.textContent.trim();
                if (buttonTexts.some(btnText => text.includes(btnText))) {
                    button.click();
                    return true;
                }
            }
            return false;
        });
        if (cookieClicked) console.log('✅ Cookie consent dismissed');
    } catch (error) {
        // Ignore
    }

    // Handle help popup
    try {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const helpPopupClosed = await page.evaluate(() => {
            const closeButtons = Array.from(document.querySelectorAll('button, [role="button"], svg'));
            for (const elem of closeButtons) {
                const svgPath = elem.querySelector('path[d*="M5.9 4.5"]');
                if (svgPath) {
                    const button = elem.closest('button') || elem.closest('[role="button"]') || elem;
                    button.click();
                    return true;
                }
            }
            return false;
        });
        if (helpPopupClosed) console.log('✅ Help popup dismissed');
    } catch (error) {
        // Ignore
    }

    // Step 1: Enter email
    console.log('📧 Entering email...');
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: CONFIG.timeout });
    const emailInput = await page.$('input[type="email"], input[name="email"]');
    await emailInput.type(CONFIG.email, { delay: 100 });

    // Click "Lanjut" button
    console.log('⏳ Clicking "Lanjut" button...');
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { }),
        page.evaluate(() => {
            const button = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Lanjut'));
            if (button) button.click();
        })
    ]);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Enter password
    console.log('🔐 Entering password...');
    await page.waitForSelector('input[id="auth-password-input"], input[name="password"]', { timeout: CONFIG.timeout });
    const passwordInput = await page.$('input[id="auth-password-input"], input[name="password"]');
    await passwordInput.type(CONFIG.password, { delay: 100 });

    // Click "Masuk" button
    console.log('⏳ Clicking "Masuk" button...');
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONFIG.timeout }).catch(() => { }),
        page.evaluate(() => {
            const button = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Masuk'));
            if (button) button.click();
        })
    ]);

    console.log('⏳ Waiting for login to complete...');
    try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONFIG.timeout });
    } catch (error) {
        // Check if already logged in
    }

    // Check if login was successful
    const currentUrl = page.url();
    if (currentUrl.includes('/auth/login')) {
        throw new Error('❌ Login failed! Please check your credentials.');
    }

    console.log('✅ Login successful!');

    // Navigate to transactions page after login
    console.log('📊 Navigating to transactions page...');
    await page.goto(CONFIG.transactionsUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

    // Save session after successful login
    await saveSession(page);
}

/**
 * Check if already logged in
 */
async function isLoggedIn(page) {
    try {
        const currentUrl = page.url();

        // If we're on an auth page, we're not logged in
        if (currentUrl.includes('/auth/login')) {
            return false;
        }

        // Try to find logged-in indicators
        const loggedIn = await page.evaluate(() => {
            // Check for common logged-in elements
            const hasUserMenu = document.querySelector('[class*="user"], [class*="profile"], [class*="account"]');
            const hasLogoutButton = Array.from(document.querySelectorAll('button, a')).some(el =>
                el.textContent.toLowerCase().includes('keluar') ||
                el.textContent.toLowerCase().includes('logout')
            );
            return !!(hasUserMenu || hasLogoutButton);
        });

        return loggedIn;
    } catch (error) {
        return false;
    }
}

/**
 * Extract transaction data with API interception
 */
async function extractTransactions(page, apiResponses) {
    // Wait for table and API responses
    console.log('💰 Waiting for transaction data...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const domTransactions = await page.evaluate(() => {
        const data = [];
        const table = document.querySelector('table');
        if (!table) return data;

        const headers = Array.from(table.querySelectorAll('thead th, thead td'))
            .map(th => th.innerText.trim().toLowerCase());

        const columnMap = {
            dateTime: headers.findIndex(h => h.includes('tanggal') || h.includes('waktu')),
            orderId: headers.findIndex(h => h.includes('id pesanan') || h.includes('pesanan')),
            gopayRefId: headers.findIndex(h => h.includes('referensi') || h.includes('gopay')),
            orderType: headers.findIndex(h => h.includes('tipe pesanan') || h.includes('jenis')),
            paymentType: headers.findIndex(h => h.includes('pembayaran') || h.includes('payment')),
            status: headers.findIndex(h => h.includes('status'))
        };

        const rows = table.querySelectorAll('tbody tr');

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            
            data.push({
                tanggalWaktu: columnMap.dateTime >= 0 ? cells[columnMap.dateTime]?.innerText.trim() : '',
                idPesanan: columnMap.orderId >= 0 ? cells[columnMap.orderId]?.innerText.trim() : '',
                idReferensiGopay: columnMap.gopayRefId >= 0 ? cells[columnMap.gopayRefId]?.innerText.trim() : '',
                tipePesanan: columnMap.orderType >= 0 ? cells[columnMap.orderType]?.innerText.trim() : '',
                tipePembayaran: columnMap.paymentType >= 0 ? cells[columnMap.paymentType]?.innerText.trim() : '',
                status: columnMap.status >= 0 ? cells[columnMap.status]?.innerText.trim() : ''
            });
        });

        return data;
    });

    // Merge DOM data with API data
    const mergedTransactions = domTransactions.map(domTx => {
        // Try to find matching transaction in API responses
        let amount = null;
        let transactionTime = null;
        let amountSource = 'not_found';

        for (const apiResp of apiResponses) {
            const apiData = apiResp.data;
            
            // Check if this API response contains transaction data
            if (apiData.hits && Array.isArray(apiData.hits)) {
                // This looks like the journals/search endpoint
                const match = apiData.hits.find(hit => {
                    const orderId = hit.metadata?.transaction?.order_id || hit.id || '';
                    return orderId.includes(domTx.idPesanan.replace('QRIS-', ''));
                });

                if (match) {
                    amount = match.amount;
                    // Get transaction_time from multiple possible locations
                    transactionTime = match.metadata?.transaction?.transaction_time || 
                                    match.time || 
                                    match.created_at;
                    amountSource = 'api_journals';
                    break;
                }
            }
        }

        // Amount is in cents (smallest unit), divide by 100 for actual Rupiah
        const amountInRupiah = amount ? amount / 100 : 0;
        
        // Format transaction time to readable format
        let formattedTime = domTx.tanggalWaktu; // Keep original if API time not found
        if (transactionTime) {
            try {
                const date = new Date(transactionTime);
                formattedTime = date.toLocaleString('id-ID', { 
                    timeZone: 'Asia/Jakarta',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            } catch (e) {
                // Keep original if parsing fails
            }
        }
        
        return {
            ...domTx,
            tanggalWaktu: formattedTime,
            transactionTime: transactionTime, // ISO format for database
            penjualanKotor: amountInRupiah ? `Rp ${amountInRupiah.toLocaleString('id-ID')}` : '',
            jumlah: amountInRupiah,
            jumlahCents: amount || 0,
            _amountSource: amountSource
        };
    });

    return mergedTransactions;
}

/**
 * Clean session and user data
 */
function cleanSessionData() {
    console.log('🧹 Cleaning session and user data...');
    
    try {
        // Remove session file
        if (fs.existsSync(CONFIG.sessionFile)) {
            fs.unlinkSync(CONFIG.sessionFile);
            console.log('✅ Session file removed');
        }
        
        // Remove user data directory
        if (fs.existsSync(CONFIG.userDataDir)) {
            fs.rmSync(CONFIG.userDataDir, { recursive: true, force: true });
            console.log('✅ User data directory removed');
        }
        
        console.log('✅ Session cleanup complete\n');
    } catch (error) {
        console.warn('⚠️  Failed to clean session data:', error.message);
    }
}

/**
 * Main monitoring function
 */
async function monitorTransactions() {
    let browser;
    let page;
    let isFirstRun = true;
    const apiResponses = []; // Store API responses for amount data

    try {
        console.log('🚀 Starting GoFood transaction monitor...');
        console.log('💡 Using API interception for accurate amount data\n');

        // Clean session and user data on startup
        cleanSessionData();

        // Validate credentials
        if (!CONFIG.email || !CONFIG.password) {
            throw new Error('❌ Missing credentials! Please set GOFOOD_EMAIL and GOFOOD_PASSWORD in .env file');
        }

        // Launch browser with persistent data
        console.log('🌐 Launching browser...');
        browser = await puppeteer.launch({
            headless: CONFIG.headless,
            userDataDir: CONFIG.userDataDir, // This persists cookies and localStorage
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Test D1 connection if enabled
        if (d1Client) {
            console.log('🔌 Testing D1 database connection...');
            const connected = await d1Client.testConnection();
            if (!connected) {
                console.warn('⚠️  D1 connection test failed. Will continue without database.');
                d1Client = null; // Disable D1 to prevent errors
            }
        }

        // Intercept API responses to capture amount data
        page.on('response', async (response) => {
            const url = response.url();
            const status = response.status();

            // Capture JSON responses that contain transaction/amount data
            if (status === 200 && response.headers()['content-type']?.includes('application/json')) {
                try {
                    const data = await response.json();
                    
                    // Store responses that contain transaction data
                    if (url.includes('journal')) {
                        // Clear old responses and keep only latest
                        const existingIndex = apiResponses.findIndex(r => r.url === url);
                        if (existingIndex >= 0) {
                            apiResponses[existingIndex] = { url, data, timestamp: new Date().toISOString() };
                        } else {
                            apiResponses.push({ url, data, timestamp: new Date().toISOString() });
                        }
                    }
                } catch (e) {
                    // Not JSON or can't parse, ignore
                }
            }
        });

        // Initial setup - perform fresh login
        console.log('🔐 Performing fresh login...');
        await performLogin(page);

        // Start monitoring loop
        console.log(`\n🔄 Starting auto-refresh every ${CONFIG.refreshInterval / 1000} seconds...`);
        console.log('Press Ctrl+C to stop\n');

        const refreshLoop = async () => {
            try {
                const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

                if (!isFirstRun) {
                    console.log(`\n🔄 [${timestamp}] Refreshing transactions...`);
                    // Navigate to transactions URL instead of just reloading to ensure we're on the right page
                    await page.goto(CONFIG.transactionsUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
                } else {
                    console.log(`\n📊 [${timestamp}] Loading initial transactions...`);
                    isFirstRun = false;
                }

                // Wait for page to load and check for transactions
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Check if there are any transactions
                const hasTransactions = await page.evaluate(() => {
                    // Check for table
                    const table = document.querySelector('table');
                    if (table) {
                        const rows = table.querySelectorAll('tbody tr');
                        return rows.length > 0;
                    }
                    
                    // Check for "no transactions" message
                    const noTransactionText = document.body.innerText.toLowerCase();
                    if (noTransactionText.includes('belum ada transaksi') || 
                        noTransactionText.includes('no transaction') ||
                        noTransactionText.includes('tidak ada transaksi')) {
                        return false;
                    }
                    
                    return false;
                });

                if (!hasTransactions) {
                    console.log('ℹ️  No transactions found (Belum ada transaksi)');
                    console.log('💤 Waiting for next refresh...');
                    return; // Skip to next refresh
                }

                // Wait a bit more for API responses to arrive
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Extract transaction data with API data
                const transactions = await extractTransactions(page, apiResponses);

                console.log(`✅ Found ${transactions.length} transactions`);
                
                // Show API capture status
                const transactionsWithAmount = transactions.filter(t => t.jumlah > 0).length;
                if (transactionsWithAmount > 0) {
                    console.log(`💰 Amount data captured: ${transactionsWithAmount}/${transactions.length} transactions`);
                } else if (transactions.length > 0) {
                    console.log(`⚠️  No amount data captured (API responses: ${apiResponses.length})`);
                }

                // Only process if we have transactions
                if (transactions.length === 0) {
                    console.log('ℹ️  No transactions to save');
                    return; // Skip to next refresh
                }

                // Calculate total
                const totalAmount = transactions.reduce((sum, t) => sum + t.jumlah, 0);
                console.log(`💰 Total: Rp ${totalAmount.toLocaleString('id-ID')}`);

                // Save to file (overwrite with latest data)
                const output = {
                    scrapedAt: new Date().toISOString(),
                    dateRange: 'today',
                    totalCount: transactions.length,
                    totalAmount: totalAmount,
                    transactions: transactions
                };

                // Save latest transactions only (no history files)
                const latestFile = path.join(__dirname, 'transactions_latest.json');
                fs.writeFileSync(latestFile, JSON.stringify(output, null, 2));

                console.log(`💾 Data saved to transactions_latest.json`);

                // Save to D1 Database if enabled
                if (d1Client) {
                    try {
                        console.log('\n💾 Saving to Cloudflare D1 database...');
                        const result = await d1Client.upsertTransactions(transactions);
                        
                        if (result.successCount > 0) {
                            console.log(`✅ D1: Saved ${result.successCount} transactions`);
                            
                            // Update daily summary
                            const today = new Date().toISOString().split('T')[0];
                            const totalAmountCents = transactions.reduce((sum, t) => sum + (t.jumlahCents || 0), 0);
                            
                            await d1Client.updateDailySummary(
                                today,
                                transactions.length,
                                totalAmount,
                                totalAmountCents
                            );
                            console.log(`✅ D1: Daily summary updated`);
                        }
                        
                        if (result.errorCount > 0) {
                            console.log(`⚠️  D1: ${result.errorCount} transactions failed to save`);
                        }
                    } catch (d1Error) {
                        console.error('❌ D1 Save Error:', d1Error.message);
                    }
                }

                // Display recent transactions (already checked length > 0 above)
                console.log('\n📋 Recent transactions:');
                transactions.slice(0, 5).forEach((t, i) => {
                    console.log(`  ${i + 1}. ${t.tanggalWaktu} - ${t.idPesanan} - ${t.penjualanKotor} (${t.status})`);
                });
                if (transactions.length > 5) {
                    console.log(`  ... and ${transactions.length - 5} more`);
                }

                // Update session periodically
                await saveSession(page);

            } catch (error) {
                console.error('❌ Error during refresh:', error.message);

                // If error might be due to logout, try to login again
                if (error.message.includes('timeout') || error.message.includes('selector')) {
                    console.log('🔄 Attempting to re-establish session...');
                    try {
                        // Navigate to transactions page first to check if logged in
                        await page.goto(CONFIG.transactionsUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });
                        const stillLoggedIn = await isLoggedIn(page);
                        if (!stillLoggedIn) {
                            await performLogin(page);
                            // performLogin now navigates to transactions page automatically
                        } else {
                            console.log('✅ Still logged in, continuing...');
                        }
                    } catch (reloginError) {
                        console.error('❌ Re-login failed:', reloginError.message);
                    }
                }
            }
        };

        // Run initial fetch
        await refreshLoop();

        // Set up interval for auto-refresh
        const intervalId = setInterval(refreshLoop, CONFIG.refreshInterval);

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n\n🛑 Stopping monitor...');
            clearInterval(intervalId);
            await saveSession(page);
            if (browser) {
                await browser.close();
            }
            console.log('✅ Monitor stopped. Session saved.');
            process.exit(0);
        });

        // Keep the process running
        await new Promise(() => { }); // Never resolves, keeps running until Ctrl+C

    } catch (error) {
        console.error('❌ Fatal error:', error.message);

        // Try to take a screenshot
        try {
            if (page) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                await page.screenshot({ path: `error_screenshot_${timestamp}.png`, fullPage: true });
                console.log(`📸 Screenshot saved for debugging`);
            }
        } catch (screenshotError) {
            // Ignore
        }

        if (browser) {
            await browser.close();
        }
        process.exit(1);
    }
}

// Run the monitor
if (require.main === module) {
    monitorTransactions();
}

module.exports = monitorTransactions;
