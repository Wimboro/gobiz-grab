require('dotenv').config();
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');

/**
 * Hybrid approach: Use Puppeteer to login and get auth token,
 * then use that token for direct API calls
 */

// Configuration
const CONFIG = {
    apiBaseUrl: 'https://api.gobiz.co.id',
    email: process.env.GOFOOD_EMAIL,
    password: process.env.GOFOOD_PASSWORD,
    timeout: 30000
};

/**
 * Login via browser and extract auth token
 */
async function getAuthToken() {
    console.log('🚀 Launching browser to get auth token...');

    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Intercept network requests to capture the access token
        let accessToken = null;

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const headers = request.headers();
            if (headers.authorization && headers.authorization.startsWith('Bearer')) {
                accessToken = headers.authorization.replace('Bearer ', '');
            }
            request.continue();
        });

        // Navigate to login page
        console.log('📄 Navigating to login page...');
        await page.goto('https://portal.gofoodmerchant.co.id/auth/login/email', {
            waitUntil: 'networkidle2',
            timeout: CONFIG.timeout
        });

        // Handle cookie consent popup if present
        console.log('🍪 Checking for cookie consent popup...');
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

            if (cookieClicked) {
                console.log('✅ Cookie consent dismissed');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.log('ℹ️  Cookie popup handling skipped');
        }

        // Handle help popup if present
        console.log('❓ Checking for help popup...');
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

            if (helpPopupClosed) {
                console.log('✅ Help popup dismissed');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.log('ℹ️  Help popup handling skipped');
        }

        // Step 1: Enter email
        console.log('🔐 Step 1: Entering email...');
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
        console.log('🔐 Step 2: Entering password...');
        await page.waitForSelector('input[id="auth-password-input"], input[name="password"]', { timeout: CONFIG.timeout });
        const passwordInput = await page.$('input[id="auth-password-input"], input[name="password"]');
        await passwordInput.type(CONFIG.password, { delay: 100 });

        // Click "Masuk" button
        console.log('⏳ Clicking "Masuk" button...');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => { }),
            page.evaluate(() => {
                const button = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Masuk') || btn.type === 'submit');
                if (button) button.click();
            })
        ]);

        console.log('⏳ Waiting for authentication...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        if (!accessToken) {
            throw new Error('Failed to capture access token');
        }

        console.log('✅ Successfully obtained auth token!');
        return accessToken;

    } finally {
        await browser.close();
    }
}

/**
 * Fetch transactions using auth token
 */
async function fetchTransactions(accessToken) {
    console.log('📊 Fetching transactions via API...');

    const instance = axios.create({
        baseURL: CONFIG.apiBaseUrl,
        timeout: CONFIG.timeout,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        }
    });

    try {
        // Calculate today's date range
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfDay = today.toISOString();
        const endOfDay = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();

        const response = await instance.post('/journals/search', {
            from: 0,
            size: 100,
            sort: {
                time: {
                    order: 'desc'
                }
            },
            included_categories: {
                incoming: ['transaction_share', 'action']
            },
            query: [
                {
                    clauses: [
                        {
                            field: 'time',
                            op: 'gte',
                            value: startOfDay
                        },
                        {
                            field: 'time',
                            op: 'lte',
                            value: endOfDay
                        }
                    ],
                    op: 'and'
                }
            ]
        });

        console.log(`✅ Fetched ${response.data.total || 0} transactions`);

        // Debug: Save raw API response
        const debugFile = `${__dirname}/debug_api_response_${Date.now()}.json`;
        fs.writeFileSync(debugFile, JSON.stringify(response.data, null, 2));
        console.log(`🐛 Debug: Raw API response saved to ${debugFile.split('/').pop()}`);

        return response.data;

    } catch (error) {
        console.error('❌ Failed to fetch transactions:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data).substring(0, 500));
        }
        throw error;
    }
}

/**
 * Parse transaction data from API response
 */
function parseTransactions(apiResponse) {
    console.log('🔍 Parsing transaction data...');

    if (!apiResponse.hits || !Array.isArray(apiResponse.hits)) {
        console.warn('⚠️  No transactions found in response');
        return [];
    }

    console.log(`📊 Found ${apiResponse.hits.length} transaction(s) in API response`);

    // Debug: Log first transaction structure
    if (apiResponse.hits.length > 0) {
        console.log('🐛 First transaction structure:');
        const firstHit = apiResponse.hits[0];
        console.log(`  - amount: ${firstHit.amount}`);
        console.log(`  - time: ${firstHit.time}`);
        console.log(`  - status: ${firstHit.status}`);
        console.log(`  - id: ${firstHit.id}`);
        console.log(`  - metadata keys:`, Object.keys(firstHit.metadata || {}));
        if (firstHit.metadata?.transaction) {
            console.log(`  - transaction.order_id: ${firstHit.metadata.transaction.order_id}`);
            console.log(`  - transaction.payment_type: ${firstHit.metadata.transaction.payment_type}`);
        }
        if (firstHit.metadata?.provider_metadata?.aspi?.data) {
            console.log(`  - aspi.data.amount: ${firstHit.metadata.provider_metadata.aspi.data.amount}`);
        }
    }

    const transactions = apiResponse.hits.map(hit => {
        try {
            const metadata = hit.metadata || {};
            const transaction = metadata.transaction || {};
            const aspiData = metadata.provider_metadata?.aspi?.data || {};
            const gopayData = metadata.gopay || {};

            // Amount from API is in cents (smallest unit)
            const amountCents = hit.amount || 0;
            const amountRupiah = amountCents / 100; // Convert cents to Rupiah
            
            // Check if aspiData has the display amount
            const displayAmount = aspiData.amount || amountRupiah;

            return {
                tanggalWaktu: hit.time || hit.created_at || '',
                idPesanan: transaction.order_id || hit.reference_id || '',
                idReferensiGopay: gopayData.gopay_transaction_id || hit.id || '',
                tipePesanan: 'GoFood',
                tipePembayaran: transaction.payment_type || '',
                penjualanKotor: `Rp ${amountRupiah.toLocaleString('id-ID')}`,
                jumlah: amountRupiah,
                jumlahCents: amountCents, // Original amount in cents
                status: hit.status || transaction.status || '',
                issuer: metadata.issuer || '',
                merchantId: hit.merchant_id || ''
            };
        } catch (error) {
            console.error('Error parsing transaction:', error);
            return null;
        }
    }).filter(t => t !== null);

    return transactions;
}

/**
 * Main function
 */
async function scrapeTransactionsHybrid() {
    try {
        console.log('🚀 Starting Hybrid GoFood Transaction Scraper...\n');

        // Validate credentials
        if (!CONFIG.email || !CONFIG.password) {
            throw new Error('❌ Missing credentials! Please set GOFOOD_EMAIL and GOFOOD_PASSWORD in .env file');
        }

        // Step 1: Get auth token via browser
        const accessToken = await getAuthToken();

        // Step 2: Fetch transactions via API
        const apiResponse = await fetchTransactions(accessToken);

        // Step 3: Parse transactions
        const transactions = parseTransactions(apiResponse);

        console.log(`✅ Parsed ${transactions.length} transactions`);

        // Save to JSON file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `transactions_hybrid_${timestamp}.json`;
        const outputPath = `${__dirname}/${filename}`;

        const output = {
            scrapedAt: new Date().toISOString(),
            totalCount: transactions.length,
            apiTotal: apiResponse.total || 0,
            transactions: transactions
        };

        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`💾 Data saved to: ${filename}`);

        // Summary
        console.log('\n📋 Transaction Summary:');
        console.log(`Total Transactions: ${transactions.length}`);

        const totalAmount = transactions.reduce((sum, t) => sum + t.jumlah, 0);
        console.log(`Total Amount: Rp ${totalAmount.toLocaleString('id-ID')}`);

        return output;

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    }
}

// Run the scraper
if (require.main === module) {
    scrapeTransactionsHybrid()
        .then(() => {
            console.log('\n✨ Scraping completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Scraping failed:', error);
            process.exit(1);
        });
}

module.exports = scrapeTransactionsHybrid;
