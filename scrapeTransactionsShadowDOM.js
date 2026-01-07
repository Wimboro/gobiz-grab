require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

/**
 * Shadow DOM workaround scraper
 * Intercepts network requests to capture amount data
 */

const CONFIG = {
    loginUrl: 'https://portal.gofoodmerchant.co.id/auth/login/email',
    transactionsUrl: 'https://portal.gofoodmerchant.co.id/transactions?date_range=today',
    email: process.env.GOFOOD_EMAIL,
    password: process.env.GOFOOD_PASSWORD,
    headless: process.env.HEADLESS === 'true',
    timeout: 30000
};

async function scrapeTransactionsShadowDOM() {
    let browser;
    const apiResponses = [];

    try {
        console.log('🚀 Starting Shadow DOM workaround scraper...');
        console.log('💡 This version intercepts API calls to get amount data\n');

        if (!CONFIG.email || !CONFIG.password) {
            throw new Error('❌ Missing credentials!');
        }

        browser = await puppeteer.launch({
            headless: CONFIG.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Intercept ALL network responses
        page.on('response', async (response) => {
            const url = response.url();
            const status = response.status();

            // Capture any JSON responses that might contain transaction data
            if (status === 200 && response.headers()['content-type']?.includes('application/json')) {
                try {
                    const data = await response.json();
                    
                    // Store responses that look like they contain transaction/amount data
                    if (JSON.stringify(data).includes('amount') || 
                        JSON.stringify(data).includes('transaction') ||
                        url.includes('transaction') ||
                        url.includes('journal')) {
                        
                        console.log(`📡 Captured API response: ${url.substring(0, 80)}...`);
                        apiResponses.push({
                            url,
                            data,
                            timestamp: new Date().toISOString()
                        });
                    }
                } catch (e) {
                    // Not JSON or can't parse, ignore
                }
            }
        });

        // Login process
        console.log('📧 Logging in...');
        await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

        // Handle popups
        await new Promise(resolve => setTimeout(resolve, 2000));
        await page.evaluate(() => {
            const buttonTexts = ['Terima Semua Cookie', 'Terima Semua', 'Accept All', 'Accept', 'Terima'];
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
        console.log('🔐 Entering email...');
        await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: CONFIG.timeout });
        await page.type('input[type="email"], input[name="email"]', CONFIG.email, { delay: 100 });
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
            page.evaluate(() => {
                const button = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Lanjut'));
                if (button) button.click();
            })
        ]);

        await new Promise(resolve => setTimeout(resolve, 1000));

        // Password
        console.log('🔐 Entering password...');
        await page.waitForSelector('input[id="auth-password-input"], input[name="password"]', { timeout: CONFIG.timeout });
        await page.type('input[id="auth-password-input"], input[name="password"]', CONFIG.password, { delay: 100 });
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONFIG.timeout }).catch(() => {}),
            page.evaluate(() => {
                const button = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Masuk'));
                if (button) button.click();
            })
        ]);

        console.log('⏳ Waiting for login...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        if (page.url().includes('/auth/login')) {
            throw new Error('❌ Login failed!');
        }

        console.log('✅ Login successful!\n');

        // Navigate to transactions
        console.log('📊 Navigating to transactions page...');
        await page.goto(CONFIG.transactionsUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

        // Wait for table
        await page.waitForSelector('table', { timeout: CONFIG.timeout });
        console.log('✅ Table found');

        // Wait for API responses
        console.log('⏳ Waiting for API responses (10 seconds)...\n');
        await new Promise(resolve => setTimeout(resolve, 10000));

        console.log(`📡 Captured ${apiResponses.length} API responses\n`);

        // Save all API responses for analysis
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(
            `api_responses_${timestamp}.json`,
            JSON.stringify(apiResponses, null, 2)
        );
        console.log(`💾 API responses saved to: api_responses_${timestamp}.json\n`);

        // Extract basic transaction data from DOM (without amounts)
        console.log('🔍 Extracting transaction data from DOM...');
        
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

        console.log(`✅ Extracted ${domTransactions.length} transactions from DOM\n`);

        // Try to match DOM data with API data
        console.log('🔗 Attempting to merge DOM data with API data...\n');
        
        const mergedTransactions = domTransactions.map(domTx => {
            // Try to find matching transaction in API responses
            let amount = null;
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
                        amountSource = 'api_journals';
                        break;
                    }
                }
            }

            // Amount is in cents (smallest unit), divide by 100 for actual Rupiah
            const amountInRupiah = amount ? amount / 100 : 0;
            
            return {
                ...domTx,
                penjualanKotor: amountInRupiah ? `Rp ${amountInRupiah.toLocaleString('id-ID')}` : '',
                jumlah: amountInRupiah,
                jumlahCents: amount || 0, // Original amount in cents
                _amountSource: amountSource
            };
        });

        // Save final output
        const output = {
            scrapedAt: new Date().toISOString(),
            dateRange: 'today',
            totalCount: mergedTransactions.length,
            method: 'shadow_dom_workaround',
            apiResponsesCount: apiResponses.length,
            transactions: mergedTransactions
        };

        const filename = `transactions_shadowdom_${timestamp}.json`;
        fs.writeFileSync(filename, JSON.stringify(output, null, 2));
        console.log(`💾 Final data saved to: ${filename}\n`);

        // Print summary
        console.log('📋 Transaction Summary:');
        mergedTransactions.forEach((t, i) => {
            console.log(`\n${i + 1}. ${t.idPesanan}`);
            console.log(`   Amount: ${t.penjualanKotor || '(not found)'}`);
            console.log(`   Source: ${t._amountSource}`);
        });

        console.log('\n💡 TIP: Check api_responses_*.json to see all captured API calls');
        console.log('    This will help identify which endpoint has the amount data\n');

        return output;

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            console.log('🔒 Browser closed');
        }
    }
}

if (require.main === module) {
    scrapeTransactionsShadowDOM()
        .then(() => {
            console.log('\n✨ Shadow DOM workaround scraping completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Scraping failed:', error);
            process.exit(1);
        });
}

module.exports = scrapeTransactionsShadowDOM;
