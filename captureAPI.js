require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

/**
 * This script helps you discover the GoFood API endpoint by intercepting network requests
 */
async function captureAPIEndpoint() {
    const browser = await puppeteer.launch({
        headless: false, // Show browser
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const apiCalls = [];

    // Intercept all network requests
    await page.setRequestInterception(true);

    page.on('request', (request) => {
        const url = request.url();
        const method = request.method();

        // Log API calls (filter for relevant endpoints)
        if (url.includes('api') || url.includes('transaction') || url.includes('portal.gofoodmerchant.co.id')) {
            console.log(`\n📡 ${method} ${url}`);

            // Log headers
            const headers = request.headers();
            if (headers.authorization) {
                console.log(`   🔑 Authorization: ${headers.authorization.substring(0, 50)}...`);
            }

            // Log POST data
            if (method === 'POST' && request.postData()) {
                console.log(`   📤 Body: ${request.postData().substring(0, 200)}...`);
            }

            apiCalls.push({
                timestamp: new Date().toISOString(),
                method,
                url,
                headers,
                postData: request.postData()
            });
        }

        request.continue();
    });

    // Intercept responses
    page.on('response', async (response) => {
        const url = response.url();
        const status = response.status();

        // Log API responses
        if (url.includes('api') || url.includes('transaction')) {
            console.log(`   ✅ Response ${status}`);

            try {
                const contentType = response.headers()['content-type'];
                if (contentType && contentType.includes('application/json')) {
                    const responseData = await response.json();
                    console.log(`   📥 Response preview:`, JSON.stringify(responseData).substring(0, 200) + '...');

                    // Save full response for transaction endpoints
                    if (url.includes('transaction')) {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        fs.writeFileSync(
                            `api_response_${timestamp}.json`,
                            JSON.stringify(responseData, null, 2)
                        );
                        console.log(`   💾 Full response saved to api_response_${timestamp}.json`);
                    }
                }
            } catch (e) {
                // Ignore errors reading response body
            }
        }
    });

    console.log('🌐 Opening GoFood login page...');
    console.log('👀 Watch the console for API calls!\n');
    console.log('📝 Instructions:');
    console.log('1. Log in to GoFood manually');
    console.log('2. Navigate to the transactions page');
    console.log('3. Check the console output for API endpoints');
    console.log('4. Press Ctrl+C when done\n');

    await page.goto('https://portal.gofoodmerchant.co.id/auth/login/email');

    // Wait indefinitely (user will close manually)
    await new Promise(() => { });
}

// Run
captureAPIEndpoint().catch(console.error);
