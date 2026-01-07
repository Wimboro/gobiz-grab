require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

// Configuration
const CONFIG = {
    loginUrl: 'https://portal.gofoodmerchant.co.id/auth/login/email',
    transactionsUrl: 'https://portal.gofoodmerchant.co.id/transactions?date_range=today',
    email: process.env.GOFOOD_EMAIL,
    password: process.env.GOFOOD_PASSWORD,
    headless: process.env.HEADLESS === 'true', // Set HEADLESS='true' in .env to hide browser (headless mode)
    timeout: 30000
};

async function scrapeTransactions() {
    let browser;

    try {
        console.log('🚀 Starting GoFood transaction scraper...');

        // Validate credentials
        if (!CONFIG.email || !CONFIG.password) {
            throw new Error('❌ Missing credentials! Please set GOFOOD_EMAIL and GOFOOD_PASSWORD in .env file');
        }

        // Launch browser
        console.log('🌐 Launching browser...');
        browser = await puppeteer.launch({
            headless: CONFIG.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Navigate to login page
        console.log('📧 Navigating to email login page...');
        await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

        // Handle cookie consent popup if present
        console.log('🍪 Checking for cookie consent popup...');
        try {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait a bit for popup to appear

            // Use page.evaluate to find and click cookie consent buttons
            const cookieClicked = await page.evaluate(() => {
                const buttonTexts = ['Terima Semua Cookie', 'Terima Semua', 'Accept All', 'Accept', 'Terima', 'Setuju', 'OK'];

                // Search all buttons
                const buttons = Array.from(document.querySelectorAll('button'));
                for (const button of buttons) {
                    const text = button.textContent.trim();
                    if (buttonTexts.some(btnText => text.includes(btnText))) {
                        button.click();
                        return true;
                    }
                }

                // Also try div/span elements that might be clickable
                const clickables = Array.from(document.querySelectorAll('[class*="cookie"] [role="button"], [class*="consent"] [role="button"]'));
                for (const elem of clickables) {
                    const text = elem.textContent.trim();
                    if (buttonTexts.some(btnText => text.includes(btnText))) {
                        elem.click();
                        return true;
                    }
                }

                return false;
            });

            if (cookieClicked) {
                console.log('✅ Cookie consent dismissed');
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                console.log('ℹ️  No cookie popup found or already dismissed');
            }
        } catch (error) {
            console.log('ℹ️  Cookie popup handling skipped:', error.message);
        }

        // Handle help popup if present ("Perlu bantuan? Cari solusinya di sini")
        console.log('❓ Checking for help popup...');
        try {
            await new Promise(resolve => setTimeout(resolve, 1500)); // Wait a bit for popup to appear

            // Try to find and click the close button (X)
            const helpPopupClosed = await page.evaluate(() => {
                // Look for close buttons with X icon or specific SVG path
                const closeButtons = Array.from(document.querySelectorAll('button, [role="button"], svg'));

                for (const elem of closeButtons) {
                    // Check for SVG path with the close icon
                    const svgPath = elem.querySelector('path[d*="M5.9 4.5"]');
                    if (svgPath) {
                        // Click the parent button
                        const button = elem.closest('button') || elem.closest('[role="button"]') || elem;
                        button.click();
                        return true;
                    }

                    // Also check for common close button indicators
                    const text = elem.textContent?.trim() || '';
                    const ariaLabel = elem.getAttribute('aria-label') || '';
                    if (text === '×' || text === 'X' || ariaLabel.toLowerCase().includes('close') || ariaLabel.toLowerCase().includes('tutup')) {
                        // Check if it's near the help text
                        const parent = elem.closest('[class*="modal"], [class*="popup"], [class*="dialog"]');
                        if (parent && parent.textContent.includes('Perlu bantuan')) {
                            elem.click();
                            return true;
                        }
                    }
                }

                return false;
            });

            if (helpPopupClosed) {
                console.log('✅ Help popup dismissed');
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                console.log('ℹ️  No help popup found or already dismissed');
            }
        } catch (error) {
            console.log('ℹ️  Help popup handling skipped:', error.message);
        }

        // Perform two-step login
        console.log('🔐 Step 1: Entering email...');

        // Wait for email input field
        await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email" i]', { timeout: CONFIG.timeout });

        // Fill in email
        const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
        await emailInput.type(CONFIG.email, { delay: 100 });

        // Click "Lanjut" (Continue) button
        console.log('⏳ Clicking "Lanjut" button...');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { }),
            page.evaluate(() => {
                const button = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Lanjut'));
                if (button) button.click();
                else throw new Error('Lanjut button not found');
            })
        ]);

        // Small delay to ensure page is ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Wait for password page to load
        console.log('🔐 Step 2: Entering password...');
        await page.waitForSelector('input[id="auth-password-input"], input[name="password"]', { timeout: CONFIG.timeout });

        // Fill in password
        const passwordInput = await page.$('input[id="auth-password-input"], input[name="password"]');
        if (passwordInput) {
            await passwordInput.type(CONFIG.password, { delay: 100 });
        } else {
            throw new Error('❌ Password field not found!');
        }

        // Click "Masuk" (Login) button
        console.log('⏳ Clicking "Masuk" button...');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONFIG.timeout }).catch(() => { }),
            page.evaluate(() => {
                const button = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Masuk'));
                if (button) button.click();
                else throw new Error('Masuk button not found');
            })
        ]);

        console.log('⏳ Waiting for login to complete...');

        // Wait for navigation after login (either success or error)
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONFIG.timeout });
        } catch (error) {
            console.log('⚠️  Navigation timeout, checking if login was successful...');
        }

        // Check if we're still on login page (login failed)
        const currentUrl = page.url();
        if (currentUrl.includes('/auth/login')) {
            throw new Error('❌ Login failed! Please check your credentials.');
        }

        console.log('✅ Login successful!');

        // Navigate to transactions page
        console.log('📊 Navigating to transactions page...');
        await page.goto(CONFIG.transactionsUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

        // Wait for transactions table/list to load
        console.log('⏳ Waiting for transactions to load...');
        await page.waitForSelector('table, .transaction-list, [class*="transaction"], [data-testid*="transaction"]', { timeout: CONFIG.timeout });

        // Wait for amount cells to load (they load asynchronously)
        console.log('💰 Waiting for amount data to load...');
        
        // Try multiple strategies to wait for amount data
        let amountLoaded = false;
        
        // Strategy 1: Wait for "Rp" text to appear in table cells
        try {
            await page.waitForFunction(() => {
                const table = document.querySelector('table');
                if (!table) return false;
                const firstRow = table.querySelector('tbody tr');
                if (!firstRow) return false;
                const cells = firstRow.querySelectorAll('td');
                
                // Check if any cell contains "Rp" (indicating amount is loaded)
                const hasRp = Array.from(cells).some(cell => {
                    const text = cell.innerText || cell.textContent || '';
                    return text.includes('Rp');
                });
                
                if (hasRp) {
                    console.log('✅ Found Rp in cells');
                    return true;
                }
                return false;
            }, { timeout: 15000 }); // Increased timeout to 15 seconds
            amountLoaded = true;
            console.log('✅ Amount data loaded (Strategy 1: Rp detection)');
        } catch (e) {
            console.log('⚠️  Strategy 1 timeout, trying alternative approach...');
        }
        
        // Strategy 2: Wait for specific column to have non-empty content
        if (!amountLoaded) {
            try {
                await page.waitForFunction(() => {
                    const table = document.querySelector('table');
                    if (!table) return false;
                    
                    // Find "penjualan kotor" column index
                    const headers = Array.from(table.querySelectorAll('thead th, thead td'));
                    const amountColIndex = headers.findIndex(h => {
                        const text = h.innerText.trim().toLowerCase();
                        return text.includes('penjualan') || text.includes('kotor') || text.includes('amount');
                    });
                    
                    if (amountColIndex === -1) return false;
                    
                    const firstRow = table.querySelector('tbody tr');
                    if (!firstRow) return false;
                    
                    const cells = firstRow.querySelectorAll('td');
                    const amountCell = cells[amountColIndex];
                    
                    if (!amountCell) return false;
                    
                    // Check if cell has content (not empty)
                    const cellText = (amountCell.innerText || amountCell.textContent || '').trim();
                    const hasContent = cellText.length > 0 && cellText !== '-' && cellText !== '';
                    
                    if (hasContent) {
                        console.log('✅ Amount cell has content:', cellText);
                        return true;
                    }
                    return false;
                }, { timeout: 15000 });
                amountLoaded = true;
                console.log('✅ Amount data loaded (Strategy 2: Column detection)');
            } catch (e) {
                console.log('⚠️  Strategy 2 timeout, waiting additional time...');
                // Final fallback: just wait longer
                await new Promise(resolve => setTimeout(resolve, 10000));
                console.log('⚠️  Proceeding after extended wait...');
            }
        }

        // Take screenshot before extraction for debugging
        const debugTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        await page.screenshot({ 
            path: `debug_before_extraction_${debugTimestamp}.png`, 
            fullPage: true 
        });
        console.log(`📸 Debug screenshot saved: debug_before_extraction_${debugTimestamp}.png`);

        // Save table HTML for debugging
        const tableHTML = await page.evaluate(() => {
            const table = document.querySelector('table');
            return table ? table.outerHTML : 'No table found';
        });
        fs.writeFileSync(`debug_table_${debugTimestamp}.html`, tableHTML);
        console.log(`💾 Table HTML saved: debug_table_${debugTimestamp}.html`);

        // Extract transaction data
        console.log('🔍 Extracting transaction data...');
        const transactions = await page.evaluate(() => {
            const data = [];

            // Find the transaction table
            const table = document.querySelector('table');
            if (!table) return data;

            // Get table headers to identify column positions
            const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(th => th.innerText.trim().toLowerCase());

            console.log('📋 Table headers found:', headers);

            // Map header names to their indices
            const columnMap = {
                dateTime: headers.findIndex(h => h.includes('tanggal') || h.includes('waktu') || h.includes('date') || h.includes('time')),
                orderId: headers.findIndex(h => h.includes('id pesanan') || h.includes('order id') || h.includes('pesanan')),
                gopayRefId: headers.findIndex(h => h.includes('referensi') || h.includes('gopay') || h.includes('reference')),
                orderType: headers.findIndex(h => h.includes('tipe pesanan') || h.includes('order type') || h.includes('jenis')),
                paymentType: headers.findIndex(h => h.includes('pembayaran') || h.includes('payment') || h.includes('metode')),
                grossSales: headers.findIndex(h => h.includes('penjualan') || h.includes('gross') || h.includes('total') || h.includes('amount') || h.includes('jumlah') || h.includes('nominal') || h.includes('kotor')),
                status: headers.findIndex(h => h.includes('status'))
            };

            console.log('🗺️  Column mapping:', columnMap);
            
            // Debug: Check first row amount cell
            const firstRow = table.querySelector('tbody tr');
            if (firstRow && columnMap.grossSales >= 0) {
                const cells = firstRow.querySelectorAll('td');
                const amountCell = cells[columnMap.grossSales];
                if (amountCell) {
                    console.log('🔍 First row amount cell HTML:', amountCell.innerHTML);
                    console.log('🔍 First row amount cell innerText:', amountCell.innerText);
                    console.log('🔍 First row amount cell textContent:', amountCell.textContent);
                }
            }

            // Get all transaction rows from tbody
            const rows = table.querySelectorAll('tbody tr');

            rows.forEach(row => {
                try {
                    const cells = row.querySelectorAll('td');
                    if (cells.length === 0) return;

                    // Try multiple methods to get the amount (ENHANCED)
                    let penjualanKotorText = '';
                    if (columnMap.grossSales >= 0) {
                        const cell = cells[columnMap.grossSales];
                        
                        if (cell) {
                            // Method 1: innerText
                            penjualanKotorText = cell.innerText?.trim() || '';
                            
                            // Method 2: textContent
                            if (!penjualanKotorText) {
                                penjualanKotorText = cell.textContent?.trim() || '';
                            }
                            
                            // Method 3: Look in nested elements (span, div, p, etc.)
                            if (!penjualanKotorText) {
                                const nestedElements = cell.querySelectorAll('span, div, p, strong, b');
                                for (const elem of nestedElements) {
                                    const text = (elem.innerText || elem.textContent || '').trim();
                                    if (text && text.length > 0) {
                                        penjualanKotorText = text;
                                        break;
                                    }
                                }
                            }
                            
                            // Method 4: Get all text nodes (including deeply nested)
                            if (!penjualanKotorText) {
                                const getAllText = (element) => {
                                    let text = '';
                                    for (const node of element.childNodes) {
                                        if (node.nodeType === Node.TEXT_NODE) {
                                            text += node.textContent;
                                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                                            text += getAllText(node);
                                        }
                                    }
                                    return text.trim();
                                };
                                penjualanKotorText = getAllText(cell);
                            }
                            
                            // Method 5: Check data attributes
                            if (!penjualanKotorText) {
                                penjualanKotorText = cell.getAttribute('data-value') || 
                                                    cell.getAttribute('data-amount') || 
                                                    cell.getAttribute('title') || '';
                            }
                        }
                    }

                    // Parse numeric amount from string like "Rp 3.999" or "Rp 150.000"
                    const parseAmount = (amountStr) => {
                        if (!amountStr) return 0;
                        // Remove "Rp", spaces, and dots (thousands separator)
                        const numStr = amountStr.replace(/Rp\s*/gi, '').replace(/\./g, '').replace(/,/g, '');
                        return parseInt(numStr) || 0;
                    };

                    // Collect all cell data for debugging
                    const rawData = Array.from(cells).map(cell => {
                        const text = cell.innerText.trim();
                        if (!text) {
                            // Try alternative methods if innerText is empty
                            return cell.textContent.trim() || cell.querySelector('span')?.innerText.trim() || '';
                        }
                        return text;
                    });

                    const transaction = {
                        tanggalWaktu: columnMap.dateTime >= 0 ? cells[columnMap.dateTime]?.innerText.trim() : '',
                        idPesanan: columnMap.orderId >= 0 ? cells[columnMap.orderId]?.innerText.trim() : '',
                        idReferensiGopay: columnMap.gopayRefId >= 0 ? cells[columnMap.gopayRefId]?.innerText.trim() : '',
                        tipePesanan: columnMap.orderType >= 0 ? cells[columnMap.orderType]?.innerText.trim() : '',
                        tipePembayaran: columnMap.paymentType >= 0 ? cells[columnMap.paymentType]?.innerText.trim() : '',
                        penjualanKotor: penjualanKotorText,
                        jumlah: parseAmount(penjualanKotorText), // Numeric amount for calculations
                        status: columnMap.status >= 0 ? cells[columnMap.status]?.innerText.trim() : '',
                        rawData: rawData,
                        headers: headers // Include headers for debugging
                    };
                    
                    // Debug log for first transaction
                    if (data.length === 0) {
                        console.log('🐛 First transaction extracted:');
                        console.log('   - penjualanKotor:', penjualanKotorText);
                        console.log('   - jumlah:', parseAmount(penjualanKotorText));
                        console.log('   - grossSales column index:', columnMap.grossSales);
                    }

                    data.push(transaction);
                } catch (error) {
                    console.error('Error extracting row data:', error);
                }
            });

            return data;
        });

        console.log(`✅ Extracted ${transactions.length} transactions`);

        // Save to JSON file
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `transactions_${timestamp}.json`;
        const outputPath = `${__dirname}/${filename}`;

        const output = {
            scrapedAt: new Date().toISOString(),
            dateRange: 'today',
            totalCount: transactions.length,
            transactions: transactions
        };

        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`💾 Data saved to: ${filename}`);

        // Also output to console
        console.log('\n📋 Transaction Data:');
        console.log(JSON.stringify(output, null, 2));

        return output;

    } catch (error) {
        console.error('❌ Error:', error.message);

        // Try to take a screenshot for debugging
        try {
            if (browser) {
                const pages = await browser.pages();
                if (pages.length > 0) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    await pages[0].screenshot({ path: `error_screenshot_${timestamp}.png`, fullPage: true });
                    console.log(`📸 Screenshot saved for debugging`);
                }
            }
        } catch (screenshotError) {
            // Ignore screenshot errors
        }

        throw error;
    } finally {
        if (browser) {
            await browser.close();
            console.log('🔒 Browser closed');
        }
    }
}

// Run the scraper
if (require.main === module) {
    scrapeTransactions()
        .then(() => {
            console.log('\n✨ Scraping completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Scraping failed:', error);
            process.exit(1);
        });
}

module.exports = scrapeTransactions;
