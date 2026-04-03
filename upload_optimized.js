import * as ftp from 'basic-ftp';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import archiver from 'archiver';
import fetch from 'node-fetch';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIG
const IS_FAST_MODE = process.argv.includes('--fast') || process.argv.includes('--app-only');

async function zipDirectory(sourceDir, outPath, skipFolders = []) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const stream = fs.createWriteStream(outPath);

    return new Promise((resolve, reject) => {
        archive
            .on('error', err => reject(err))
            .on('warning', err => console.warn(err))
            .pipe(stream);

        // Add each item in sourceDir
        const items = fs.readdirSync(sourceDir);
        for (const item of items) {
            const itemPath = path.join(sourceDir, item);
            const isDir = fs.statSync(itemPath).isDirectory();

            if (isDir) {
                if (skipFolders.includes(item)) {
                    console.log(`⚡ Skipping [${item}] as per fast mode...`);
                    continue;
                }
                archive.directory(itemPath, item);
            } else {
                archive.file(itemPath, { name: item });
            }
        }

        stream.on('close', () => resolve());
        archive.finalize();
    });
}

async function deploy() {
    console.log(`🚀 Starting ${IS_FAST_MODE ? '[Fast Mode] ' : ''}ZIP Deployment...`);

    // Check FTP credentials
    if (!process.env.FTP_HOST || !process.env.FTP_USER || !process.env.FTP_PASSWORD) {
        console.error('❌ Error: FTP credentials not found in .env');
        process.exit(1);
    }

    const config = {
        host: process.env.FTP_HOST,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASSWORD,
        secure: process.env.FTP_SECURE === 'true',
        port: process.env.FTP_PORT ? parseInt(process.env.FTP_PORT) : 21,
    };

    const localRootDir = path.join(__dirname, 'dist');
    const zipName = 'deploy.zip';
    const zipFilePath = path.join(__dirname, zipName);
    const remoteRootDir = process.env.FTP_REMOTE_DIR || '/';
    const unzipPhpName = 'unzip_script.php';
    const localUnzipPhpPath = path.join(__dirname, 'unzip.php');

    // Generate a one-time security token
    const deployToken = crypto.randomBytes(32).toString('hex');
    console.log(`🔑 Generated security token for session.`);

    if (!fs.existsSync(localRootDir)) {
        console.error('❌ Error: dist folder not found. Run npm run build first!');
        process.exit(1);
    }

    // 1. Zipping
    try {
        const skipFolders = IS_FAST_MODE ? ['view', 'LOT_1', 'LOT_2', 'LOT_3', 'LOT_4'] : [];
        process.stdout.write("🤐 Creating deployment package... ");
        await zipDirectory(localRootDir, zipFilePath, skipFolders);
        const zipSize = (fs.statSync(zipFilePath).size / (1024 * 1024)).toFixed(2);
        console.log(`Done! (${zipSize} MB)`);
    } catch (err) {
        console.error('\n❌ Zipping failed:', err);
        process.exit(1);
    }

    // 2. FTP Upload
    const client = new ftp.Client();
    try {
        await client.access(config);
        console.log("🔌 Connected to FTP.");

        process.stdout.write("📤 Uploading zip and extracter... ");
        // Remote paths MUST use forward slashes (/) for FTP, even on Windows
        const remoteZipPath = `${remoteRootDir.replace(/\\/g, '/')}/${zipName}`;
        await client.uploadFrom(zipFilePath, remoteZipPath);

        // Prepare localized unzip script with the token
        let phpContent = fs.readFileSync(localUnzipPhpPath, 'utf8');
        phpContent = phpContent.replace('{{DEPLOY_TOKEN}}', deployToken);
        const tempPhpPath = path.join(__dirname, 'unzip_temp.php');
        fs.writeFileSync(tempPhpPath, phpContent);

        const remotePhpPath = `${remoteRootDir.replace(/\\/g, '/')}/${unzipPhpName}`;
        await client.uploadFrom(tempPhpPath, remotePhpPath);
        console.log("Done!");
        client.close();
        if (fs.existsSync(tempPhpPath)) fs.unlinkSync(tempPhpPath);

        // 3. Extraction via HTTP
        console.log("⚡ Executing remote extraction...");
        const baseUrl = process.env.APP_URL || `http://${config.host}`;
        const triggerUrl = `${baseUrl}/${unzipPhpName}?key=${deployToken}&t=${Date.now()}`;

        const response = await fetch(triggerUrl);
        const text = await response.text();

        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error("\n❌ Server Error (Raw response):", text);
            process.exit(1);
        }

        if (result.status === 'success') {
            console.log(`\n✨ Perfect: ${result.message}`);
        } else {
            console.error(`\n💥 Extraction Error: ${result.message}`);
        }

    } catch (err) {
        console.error('\n❌ FTP/Network Error:', err.message);
    } finally {
        if (!client.closed) client.close();
        if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath);
        console.log("🧹 Local temporary zip removed.");
    }
}

deploy();
