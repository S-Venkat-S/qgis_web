import * as ftp from 'basic-ftp';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function deploy() {
    const client = new ftp.Client();
    client.ftp.verbose = true;

    const config = {
        host: process.env.FTP_HOST,
        user: process.env.FTP_USER,
        password: process.env.FTP_PASSWORD,
        secure: process.env.FTP_SECURE === 'true',
        port: process.env.FTP_PORT ? parseInt(process.env.FTP_PORT) : 21,
    };

    const remoteDir = process.env.FTP_REMOTE_DIR || '/';
    const localDir = path.join(__dirname, 'dist');

    if (!config.host || !config.user || !config.password) {
        console.error('Error: FTP credentials not found. Please check your .env file.');
        process.exit(1);
    }

    try {
        await client.access(config);
        console.log("Connected to FTP server");

        await client.ensureDir(remoteDir);

        console.log(`Uploading files from ${localDir} to ${remoteDir}...`);
        await client.uploadFromDir(localDir);

        console.log("Upload complete!");
    } catch (err) {
        console.error('Upload failed:', err);
        process.exit(1);
    }
    client.close();
}

deploy();
