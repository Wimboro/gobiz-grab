require('dotenv').config();
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Direct API scraper - No DOM scraping needed
 * Uses Puppeteer only for authentication, then uses API directly
 */

const CONFIG = {
    loginUrl: 'https://portal.gofoodmerchant.co.id/auth/login/email',
    transactionsUrl: 'https://portal.gofoodmerchant.co.id/transactions?date_range=today',
    journalsApiUrl: 'https://api.gobiz.co.id/journals/search',
    email: process.env.GOFOOD_EMAIL,
    password: process.env.GOFOOD_PASSWORD,
    headless: process.env.HEADLESS === 'true',
    timeout: 30000
};

/**
 * Get authentication cookies and headers
 */
async function getAuthCredentials() {
    let browser;
    
    try {
        console.log('🔐 Getting authentication credentials...\n');
        
        browser = await puppeteer.launch({
            headless: CONFIG.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Login process
        console.log('📧 Logging in to GoFood portal...');
        try {
            await page.goto(CONFIG.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e) {
            console.log('⚠️  Initial navigation slow, continuing...');
        }
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Handle popups
        await new Promise(resolve => setTimeout(resolve, 2000));
        await page.evaluate(() => {
            const buttonTexts = ['Terima Semua Cookie', 'Terima Semua', 'Accept All'];
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const button of buttons) {
                if (buttonTexts.some(text => button.textContent.includes(text))) {
                    button.click();
                    return;
                }
            }
        });

        await new Promise(resolve => setTimeout(resolve, 1500));
        await page.evaluate(() => {
            const closeButtons = Array.from(document.querySelectorAll('button, [role="button"], svg'));
            for (const elem of closeButtons) {
                const svgPath = elem.querySelector('path[d*="M5.9 4.5"]');
                if (svgPath) {
                    const button = elem.closest('button') || elem.closest('[role="button"]') || elem;
                    button.click();
                    return;
                }
            }
        });

        // Email
        await page.waitForSelector('input[type="email"]', { timeout: CONFIG.timeout });
        await page.type('input[type="email"]', CONFIG.email, { delay: 100 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
            page.evaluate(() => {
                const button = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Lanjut'));
                if (button) button.click();
            })
        ]);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Password
        await page.waitForSelector('input[id="auth-password-input"]', { timeout: CONFIG.timeout });
        await page.type('input[id="auth-password-input"]', CONFIG.password, { delay: 100 });
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONFIG.timeout }).catch(() => {}),
            page.evaluate(() => {
                const button = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Masuk'));
                if (button) button.click();
            })
        ]);

        await new Promise(resolve => setTimeout(resolve, 3000));

        if (page.url().includes('/auth/login')) {
            throw new Error('❌ Login failed!');
        }

        console.log('✅ Login successful!\n');

        // Navigate to transactions page to trigger API calls
        console.log('📊 Loading transactions page...');
        try {
            await page.goto(CONFIG.transactionsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e) {
            console.log('⚠️  Page load slow, continuing...');
        }
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get cookies
        const cookies = await page.cookies();
        
        // Get localStorage (may contain auth tokens)
        const localStorage = await page.evaluate(() => {
            const data = {};
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                data[key] = window.localStorage.getItem(key);
            }
            return data;
        });

        console.log('✅ Authentication credentials obtained\n');

        return { cookies, localStorage };

    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Fetch transactions from API directly
 */
async function fetchTransactionsFromAPI(cookies, localStorage) {
    try {
        console.log('📡 Fetching transactions from journals API...\n');

        // Build cookie string
        const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        // Build headers (similar to browser request)
        const headers = {
            'Accept': 'application/json',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Content-Type': 'application/json',
            'Cookie': cookieString,
            'Origin': 'https://portal.gofoodmerchant.co.id',
            'Referer': 'https://portal.gofoodmerchant.co.id/',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        // Get today's date range
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));

        // API request body (based on observed network requests)
        const requestBody = {
            "from": 0,
            "size": 100,
            "query": {
                "bool": {
                    "must": [
                        {
                            "range": {
                                "time": {
                                    "gte": startOfDay.toISOString(),
                                    "lte": endOfDay.toISOString()
                                }
                            }
                        }
                    ]
                }
            },
            "sort": [
                {
                    "time": {
                        "order": "desc"
                    }
                }
            ]
        };

        // Make API request
        const response = await axios.post(CONFIG.journalsApiUrl, requestBody, { headers });

        if (response.status !== 200) {
            throw new Error(`API returned status ${response.status}`);
        }

        const data = response.data;
        
        if (!data.hits || !Array.isArray(data.hits)) {
            console.log('⚠️  No transactions found in API response');
            return [];
        }

        console.log(`✅ Fetched ${data.hits.length} transactions from API\n`);

        // Transform API data to our format
        const transactions = data.hits.map(hit => {
            const amount = hit.amount || 0;
            const amountInRupiah = amount / 100; // Convert cents to Rupiah
            
            // Get transaction time
            const transactionTime = hit.metadata?.transaction?.transaction_time || 
                                  hit.time || 
                                  hit.created_at;
            
            // Format time for display
            let formattedTime = '';
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
                    formattedTime = transactionTime;
                }
            }

            // Extract transaction details
            const orderId = hit.metadata?.transaction?.order_id || hit.id || '';
            const paymentType = hit.metadata?.transaction?.payment_type || '';
            const status = hit.metadata?.transaction?.status || hit.status || '';
            
            return {
                tanggalWaktu: formattedTime,
                transactionTime: transactionTime,
                idPesanan: orderId,
                idReferensiGopay: hit.reference_id || '',
                tipePesanan: hit.metadata?.gopay?.source || 'GoPay Instore',
                tipePembayaran: paymentType.toUpperCase(),
                penjualanKotor: `Rp ${amountInRupiah.toLocaleString('id-ID')}`,
                jumlah: amountInRupiah,
                jumlahCents: amount,
                status: status.charAt(0).toUpperCase() + status.slice(1),
                _amountSource: 'api_direct',
                _apiData: {
                    id: hit.id,
                    type: hit.type,
                    category: hit.category,
                    merchant_id: hit.merchant_id,
                    currency: hit.currency
                }
            };
        });

        return transactions;

    } catch (error) {
        console.error('❌ API Request Error:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        }
        throw error;
    }
}

/**
 * Main function
 */
async function scrapeTransactionsDirectAPI() {
    try {
        console.log('🚀 Starting Direct API scraper...');
        console.log('💡 This version uses API directly without DOM scraping\n');

        if (!CONFIG.email || !CONFIG.password) {
            throw new Error('❌ Missing credentials! Please set GOFOOD_EMAIL and GOFOOD_PASSWORD in .env file');
        }

        // Step 1: Get auth credentials
        const { cookies, localStorage } = await getAuthCredentials();

        // Step 2: Fetch transactions from API
        const transactions = await fetchTransactionsFromAPI(cookies, localStorage);

        if (transactions.length === 0) {
            console.log('ℹ️  No transactions found for today\n');
            return { transactions: [], totalCount: 0, totalAmount: 0 };
        }

        // Calculate total
        const totalAmount = transactions.reduce((sum, t) => sum + t.jumlah, 0);

        console.log('📊 Transaction Summary:');
        console.log(`   Total transactions: ${transactions.length}`);
        console.log(`   Total amount: Rp ${totalAmount.toLocaleString('id-ID')}\n`);

        // Save to file
        const output = {
            scrapedAt: new Date().toISOString(),
            dateRange: 'today',
            method: 'direct_api',
            totalCount: transactions.length,
            totalAmount: totalAmount,
            transactions: transactions
        };

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `transactions_direct_api_${timestamp}.json`;
        fs.writeFileSync(filename, JSON.stringify(output, null, 2));
        console.log(`💾 Data saved to: ${filename}\n`);

        // Display recent transactions
        console.log('📋 Recent transactions:');
        transactions.slice(0, 10).forEach((t, i) => {
            console.log(`  ${i + 1}. ${t.tanggalWaktu} - ${t.idPesanan} - ${t.penjualanKotor} (${t.status})`);
        });
        if (transactions.length > 10) {
            console.log(`  ... and ${transactions.length - 10} more`);
        }

        console.log('\n✨ Direct API scraping completed successfully!');
        return output;

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    }
}

if (require.main === module) {
    scrapeTransactionsDirectAPI()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('\n💥 Scraping failed:', error);
            process.exit(1);
        });
}

module.exports = scrapeTransactionsDirectAPI;
