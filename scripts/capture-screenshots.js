import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8081; // Use a different port to avoid conflicts
const URL = `http://localhost:${PORT}`;
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'images');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function startServer() {
    console.log('Starting backend server for screenshots...');
    const serverProcess = spawn('node', ['backend/server.js'], {
        stdio: 'pipe',
        env: {
            ...process.env,
            PORT: PORT.toString(),
            PERSONIO_CLIENT_ID: '', // Force Demo Mode
            PERSONIO_CLIENT_SECRET: '',
            AUTH_ENABLED: 'false', // Disable Auth
            NODE_ENV: 'production', // Serve static files
        },
        cwd: path.join(__dirname, '..'), // Root of the project
    });

    serverProcess.stdout.on('data', (data) => console.log(`[Server]: ${data}`));
    serverProcess.stderr.on('data', (data) => console.error(`[Server Error]: ${data}`));

    // Wait for server to be ready
    return new Promise((resolve, reject) => {
        const checkServer = setInterval(async () => {
            try {
                const res = await fetch(`${URL}/health`);
                if (res.ok) {
                    clearInterval(checkServer);
                    console.log('Server is up!');
                    resolve(serverProcess);
                }
            } catch (e) {
                // Wait
            }
        }, 500);

        // Timeout after 10 seconds
        setTimeout(() => {
            clearInterval(checkServer);
            reject(new Error('Server start timeout'));
        }, 10000);
    });
}

async function capture() {
    let serverProcess;
    let browser;

    try {
        serverProcess = await startServer();

        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();

        // Set viewport size for consistent screenshots
        await page.setViewport({ width: 1280, height: 800 });

        console.log(`Navigating to ${URL}...`);
        await page.goto(URL, { waitUntil: 'networkidle0' });

        // Wait for Org Chart to render (look for a node/card)
        await page.waitForSelector('.org-chart-node', { timeout: 5000 }).catch(() => console.log("Waiting for org-chart-node timed out/not found immediately"));

        // Give it a moment for animations/layout
        await new Promise(r => setTimeout(r, 2000));

        // Light Mode Screenshot
        console.log('Taking Light Mode screenshot...');
        await page.screenshot({ path: path.join(OUTPUT_DIR, 'demo-light.png') });

        // Switch to Dark Mode
        console.log('Switching to Dark Mode...');
        // Click the theme toggle button. It has a title attribute or class we can target.
        // Based on App.jsx: title={`Switch to ${darkMode ? 'Light' : 'Dark'} Mode`}
        // When light (default), title is "Switch to Dark Mode".
        // Button class is "control-btn".

        const themeBtn = await page.$('button[title="Switch to Dark Mode"]');
        if (themeBtn) {
            await themeBtn.click();
            // Wait for transition
            await new Promise(r => setTimeout(r, 1000));

            console.log('Taking Dark Mode screenshot...');
            await page.screenshot({ path: path.join(OUTPUT_DIR, 'demo-dark.png') });
        } else {
            console.error('Could not find theme toggle button!');
        }

    } catch (error) {
        console.error('Screenshot capture failed:', error);
        process.exit(1);
    } finally {
        if (browser) await browser.close();
        if (serverProcess) {
            console.log('Stopping server...');
            serverProcess.kill();
        }
    }
}

capture();
