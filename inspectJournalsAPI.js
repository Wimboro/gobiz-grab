require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

/**
 * Inspect journals API structure to find transaction_time
 */

const CONFIG = {
    loginUrl: 'https://portal.gofoodmerchant.co.id/auth/login/email',
    transactionsUrl: 'https://portal.gofoodmerchant.co.id/transactions?date_range=today',
    email: process.env.GOFOOD_EMAIL,
    password: process.env.GOFOOD_PASSWORD,
    headless: false, // Show browser for inspection
    timeout: 30000
};

async function inspectJournalsAPI() {
    let browser;
    const journalResponses = [];

    try {
        console.log('🔍 Inspecting journals API structure...\n');

        if (!CONFIG.email || !CONFIG.password) {
            throw new Error('❌ Missing credentials!');
        }

        browser = await puppeteer.launch({
            headless: CONFIG.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Intercept journals API responses
        page.on('response', async (response) => {
            const url = response.url();
            const status = response.status();

            if (status === 200 && url.includes('journal') && response.headers()['content-type']?.includes('application/json')) {
                try {
                    const data = await response.json();
                    console.log(`📡 Captured journals API: ${url}\n`);
                    journalResponses.push({
                        url,
                        data,
                        timestamp: new Date().toISOString()
                    });
                } catch (e) {
                    // Ignore
                }
            }
        });

        // Login
        console.log('📧 Logging in...');
        await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

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

        console.log('✅ Login successful!\n');

        // Navigate to transactions
        console.log('📊 Navigating to transactions page...');
        await page.goto(CONFIG.transactionsUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

        // Wait for API responses
        console.log('⏳ Waiting for journals API responses...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));

        if (journalResponses.length === 0) {
            console.log('⚠️  No journals API responses captured');
            return;
        }

        console.log(`✅ Captured ${journalResponses.length} journals API response(s)\n`);

        // Analyze structure
        for (const resp of journalResponses) {
            console.log('═══════════════════════════════════════════════════════');
            console.log(`📡 URL: ${resp.url}`);
            console.log('═══════════════════════════════════════════════════════\n');

            const data = resp.data;

            // Check structure
            console.log('📋 Response Structure:');
            console.log(`   - Has 'hits': ${!!data.hits}`);
            console.log(`   - Hits count: ${data.hits?.length || 0}`);
            console.log(`   - Has 'total': ${!!data.total}`);
            console.log(`   - Total value: ${data.total || 'N/A'}\n`);

            if (data.hits && data.hits.length > 0) {
                console.log('🔍 First Hit Structure:');
                const firstHit = data.hits[0];
                
                console.log('\n📦 Available Fields:');
                console.log(JSON.stringify(Object.keys(firstHit), null, 2));

                console.log('\n💰 Amount Field:');
                console.log(`   - amount: ${firstHit.amount}`);

                console.log('\n🆔 ID Fields:');
                console.log(`   - id: ${firstHit.id}`);
                console.log(`   - metadata.transaction.order_id: ${firstHit.metadata?.transaction?.order_id}`);

                console.log('\n⏰ Time Fields:');
                console.log(`   - created_at: ${firstHit.created_at}`);
                console.log(`   - updated_at: ${firstHit.updated_at}`);
                console.log(`   - transaction_time: ${firstHit.transaction_time}`);
                console.log(`   - metadata.transaction.transaction_time: ${firstHit.metadata?.transaction?.transaction_time}`);

                console.log('\n📊 Metadata Structure:');
                if (firstHit.metadata) {
                    console.log(JSON.stringify(firstHit.metadata, null, 2));
                }

                console.log('\n🔍 Full First Hit:');
                console.log(JSON.stringify(firstHit, null, 2));

                console.log('\n');
            }
        }

        // Save to file
        const filename = `journals_api_inspection_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        fs.writeFileSync(filename, JSON.stringify(journalResponses, null, 2));
        console.log(`💾 Full API responses saved to: ${filename}\n`);

        console.log('✨ Inspection complete! Check the output above for time fields.\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

if (require.main === module) {
    inspectJournalsAPI()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('💥 Failed:', error);
            process.exit(1);
        });
}

module.exports = inspectJournalsAPI;
