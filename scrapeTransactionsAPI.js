require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Configuration
const CONFIG = {
    apiBaseUrl: 'https://api.gobiz.co.id',
    clientId: 'go-biz-web-new',
    email: process.env.GOFOOD_EMAIL,
    password: process.env.GOFOOD_PASSWORD,
    timeout: 30000
};

/**
 * Login to GoFood API and get access token
 */
async function login() {
    console.log('🔐 Logging in to GoFood API...');

    try {
        const instance = axios.create({
            baseURL: CONFIG.apiBaseUrl,
            timeout: CONFIG.timeout,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
            }
        });

        // Step 1: Login request
        console.log('📧 Sending login request...');
        const loginRequest = await instance.post('/goid/login/request', {
            email: CONFIG.email,
            login_type: 'password',
            client_id: CONFIG.clientId
        });

        if (!loginRequest.data.success) {
            throw new Error('Login request failed');
        }

        // Step 2: Get access token
        console.log('🔑 Getting access token...');
        const tokenResponse = await instance.post('/goid/token', {
            client_id: CONFIG.clientId,
            grant_type: 'password',
            data: {
                email: CONFIG.email,
                password: CONFIG.password
            }
        });

        const accessToken = tokenResponse.data.access_token;

        if (!accessToken) {
            throw new Error('No access token received');
        }

        console.log('✅ Login successful!');

        return {
            instance,
            accessToken
        };
    } catch (error) {
        console.error('❌ Login failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', error.response.data);
        }
        throw error;
    }
}

/**
 * Fetch transactions from API
 */
async function fetchTransactions(authClient, dateRange = 'today') {
    console.log(`📊 Fetching transactions (${dateRange})...`);

    try {
        // Calculate date range
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfDay = today.toISOString();
        const endOfDay = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString();

        // Make API request to get transactions
        const response = await authClient.instance.post('/journals/search', {
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
        }, {
            headers: {
                'Authorization': `Bearer ${authClient.accessToken}`
            }
        });

        console.log(`✅ Fetched ${response.data.total || 0} transactions`);
        return response.data;
    } catch (error) {
        console.error('❌ Failed to fetch transactions:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', JSON.stringify(error.response.data).substring(0, 200));
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

    const transactions = apiResponse.hits.map(hit => {
        try {
            // Extract relevant fields from the API response
            const metadata = hit.metadata || {};
            const transaction = metadata.transaction || {};
            const aspiData = metadata.provider_metadata?.aspi?.data || {};
            const gopayData = metadata.gopay || {};

            // Parse amount (API returns in cents - smallest unit)
            const amountCents = hit.amount || 0;
            const amountRupiah = amountCents / 100; // Convert cents to Rupiah

            return {
                tanggalWaktu: hit.time || hit.created_at || '',
                idPesanan: transaction.order_id || hit.reference_id || '',
                idReferensiGopay: gopayData.gopay_transaction_id || hit.id || '',
                tipePesanan: 'GoFood', // Could extract from metadata if available
                tipePembayaran: transaction.payment_type || hit.metadata?.payment_type || '',
                penjualanKotor: `Rp ${amountRupiah.toLocaleString('id-ID')}`,
                jumlah: amountRupiah,
                jumlahCents: amountCents, // Original amount in cents
                status: hit.status || transaction.status || '',
                issuer: metadata.issuer || '', // Bank/payment issuer
                merchantId: hit.merchant_id || '',
                rawData: hit // Store complete response for debugging
            };
        } catch (error) {
            console.error('Error parsing transaction:', error);
            return null;
        }
    }).filter(t => t !== null);

    return transactions;
}

/**
 * Main function to scrape transactions via API
 */
async function scrapeTransactionsAPI(dateRange = 'today') {
    try {
        console.log('🚀 Starting GoFood API transaction scraper...');

        // Validate credentials
        if (!CONFIG.email || !CONFIG.password) {
            throw new Error('❌ Missing credentials! Please set GOFOOD_EMAIL and GOFOOD_PASSWORD in .env file');
        }

        // Login and get authenticated client
        const authClient = await login();

        // Fetch transactions
        const apiResponse = await fetchTransactions(authClient, dateRange);

        // Parse transactions
        const transactions = parseTransactions(apiResponse);

        console.log(`✅ Parsed ${transactions.length} transactions`);

        // Save to JSON file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `transactions_api_${timestamp}.json`;
        const outputPath = `${__dirname}/${filename}`;

        const output = {
            scrapedAt: new Date().toISOString(),
            dateRange: dateRange,
            totalCount: transactions.length,
            apiTotal: apiResponse.total || 0,
            transactions: transactions
        };

        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`💾 Data saved to: ${filename}`);

        // Also output summary to console
        console.log('\n📋 Transaction Summary:');
        console.log(`Total Transactions: ${transactions.length}`);

        const totalAmount = transactions.reduce((sum, t) => sum + t.jumlah, 0);
        console.log(`Total Amount: Rp ${totalAmount.toLocaleString('id-ID')}`);

        return output;

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

// Run the scraper
if (require.main === module) {
    const dateRange = process.argv[2] || 'today'; // Allow custom date range from command line

    scrapeTransactionsAPI(dateRange)
        .then(() => {
            console.log('\n✨ Scraping completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Scraping failed:', error);
            process.exit(1);
        });
}

module.exports = scrapeTransactionsAPI;
