import * as ftp from 'basic-ftp';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIG
const MAX_CONCURRENT_CLIENTS = 10;
const SKIP_DATA_FOLDER = process.argv.includes('--fast') || process.argv.includes('--app-only');

async function getFiles(dir, allFiles = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const name = path.join(dir, file);
        if (fs.statSync(name).isDirectory()) {
            // Check if we should skip the view/data folder
            if (SKIP_DATA_FOLDER && (file === 'view' || file === 'LOT_1' || file === 'LOT_2' || file === 'LOT_3' || file === 'LOT_4')) {
                console.log(`Skipping data folder: ${name}`);
                continue;
            }
            await getFiles(name, allFiles);
        } else {
            allFiles.push(name);
        }
    }
    return allFiles;
}

async function deploy() {
    console.log("🚀 Starting Optimized Deployment...");
    const config = {
        host: process.env.FTP_HOST,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASSWORD,
        secure: process.env.FTP_SECURE === 'true',
        port: process.env.FTP_PORT ? parseInt(process.env.FTP_PORT) : 21,
    };

    const localRootDir = path.join(__dirname, 'dist');
    const remoteRootDir = process.env.FTP_REMOTE_DIR || '/';

    if (!config.host || !config.user || !config.password) {
        console.error('Error: FTP credentials not found. Please check your .env file.');
        process.exit(1);
    }

    const allLocalFiles = await getFiles(localRootDir);
    console.log(`📦 Found ${allLocalFiles.length} files to upload.`);

    if (SKIP_DATA_FOLDER) {
        console.log("⚡ [Fast Mode] Skipping heavy data files (CSVs in view/)");
    }

    const fileQueue = [...allLocalFiles];
    const clients = [];
    const activeClientsCount = Math.min(MAX_CONCURRENT_CLIENTS, fileQueue.length);

    console.log(`🔌 Opening ${activeClientsCount} concurrent connections...`);

    const remoteDirCache = new Map(); // Map<dirPath, Map<fileName, remoteFile>>

    // Helper to get remote file listing for a directory (cached)
    const getRemoteFiles = async (client, remoteDir) => {
        if (remoteDirCache.has(remoteDir)) return remoteDirCache.get(remoteDir);

        try {
            const list = await client.list(remoteDir);
            const fileMap = new Map();
            list.forEach(f => fileMap.set(f.name, f));
            remoteDirCache.set(remoteDir, fileMap);
            return fileMap;
        } catch (err) {
            // If dir doesn't exist, return empty map
            return new Map();
        }
    };

    // Helper to upload a single file using a specific client
    const uploadFile = async (client, localPath) => {
        const relativePath = path.relative(localRootDir, localPath);
        const remotePath = path.join(remoteRootDir, relativePath).replace(/\\/g, '/');
        const remoteDir = path.dirname(remotePath).replace(/\\/g, '/');
        const fileName = path.basename(remotePath);

        const stats = fs.statSync(localPath);
        const remoteFiles = await getRemoteFiles(client, remoteDir);
        const remoteFile = remoteFiles.get(fileName);

        if (remoteFile) {
            const sizeMatches = remoteFile.size === stats.size;
            // FTP times are often slightly off, so we allow a small threshold (e.g. 2s)
            const timeDiff = Math.abs(remoteFile.modifiedAt.getTime() - stats.mtime.getTime());
            const timeMatches = timeDiff < 2000;

            if (sizeMatches && timeMatches) {
                // Skip upload
                return;
            }
        }

        try {
            await client.ensureDir(remoteDir);
            await client.uploadFrom(localPath, fileName);
            console.log(`✅ Uploaded: ${relativePath}`);
        } catch (err) {
            console.error(`❌ Failed to upload ${relativePath}:`, err.message);
            fileQueue.push(localPath);
        }
    };

    // Worker function for each client
    const worker = async () => {
        const client = new ftp.Client();
        // client.ftp.verbose = true;
        await client.access(config);
        clients.push(client);

        while (fileQueue.length > 0) {
            const file = fileQueue.shift();
            if (!file) break;
            await uploadFile(client, file);
        }
    };

    const startTime = Date.now();

    try {
        // Start workers
        const workers = Array.from({ length: activeClientsCount }).map(() => worker());
        await Promise.all(workers);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✨ Deployment complete in ${duration}s!`);
    } catch (err) {
        console.error('\n💥 Deployment failed:', err);
    } finally {
        for (const client of clients) {
            client.close();
        }
    }
}

deploy();
