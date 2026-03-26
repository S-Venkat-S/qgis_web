import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viewDir = path.resolve(__dirname, 'public/view');

/**
 * Creates a zip bundle for a lot and updates its index.txt with a version header.
 */
async function processFolder(dir) {
    const relativePath = path.relative(viewDir, dir) || '.';
    const folderName = path.basename(dir);
    
    // 1. Cleanup old zips
    const items = fs.readdirSync(dir);
    items.forEach(item => {
        if (item.endsWith('.zip')) {
            fs.unlinkSync(path.join(dir, item));
        }
    });

    const zip = new JSZip();
    const filesToIndex = [];
    const timestamp = Date.now();

    // 2. Handle Virtual Redirect Folders (G_ folders) differently
    if (folderName.startsWith('G_')) {
        const indexFile = path.join(dir, 'index.txt');
        if (fs.existsSync(indexFile)) {
            console.log(`[G-FOLDER] Processing ${folderName}...`);
            const content = fs.readFileSync(indexFile, 'utf8');
            const lines = content.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0 && !l.startsWith('#') && l.toLowerCase().endsWith('.csv'));

            for (let line of lines) {
                // Ensure no trailing dots or hidden chars from manual edits
                line = line.replace(/\.+$/, '').trim(); 
                
                // Try resolving relative to the current folder first, then relative to viewDir
                let fullPath = path.resolve(dir, line);
                if (!fs.existsSync(fullPath)) {
                    fullPath = path.resolve(viewDir, line);
                }

                if (fs.existsSync(fullPath)) {
                    const fileContent = fs.readFileSync(fullPath);
                    const baseName = path.basename(line);
                    zip.file(baseName, fileContent);
                    filesToIndex.push(line);
                } else {
                    console.warn(` [MISSING] ${line} (Checked in ${dir} and ${viewDir})`);
                }
            }
        }
    } else {
        // 3. Regular LOT Folders
        for (const item of items) {
            if (item.endsWith('.zip')) continue; // Skip since we already cleaned/handled zips
            const itemPath = path.join(dir, item);
            const stats = fs.statSync(itemPath);

            if (stats.isDirectory()) {
                await processFolder(itemPath);
            } else if (item !== 'index.txt' && item.toLowerCase().endsWith('.csv')) {
                const fileContent = fs.readFileSync(itemPath);
                zip.file(item, fileContent);
                filesToIndex.push(item);
            }
        }
    }

    // 4. Generate the ZIP and write index.txt
    if (filesToIndex.length > 0) {
        const zipName = 'lot_bundle.zip';
        const zipBuffer = await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'DEFLATE',
            compressionOptions: { level: 9 }
        });
        
        fs.writeFileSync(path.join(dir, zipName), zipBuffer);
        
        const indexContent = [
            `#v:${timestamp}`,
            ...filesToIndex
        ].join('\n');
        
        fs.writeFileSync(path.join(dir, 'index.txt'), indexContent, 'utf8');
        console.log(`[ZIP] Generated bundle and versioned index in: ${relativePath}`);
    }
}

// Ensure the root directory exists
if (!fs.existsSync(viewDir)) {
    console.error(`Error: Directory ${viewDir} does not exist.`);
    process.exit(1);
}

console.log('🚀 Starting Smart Indexing & Zipping...');
processFolder(viewDir)
    .then(() => {
        console.log('-------------------------------');
        console.log('✨ All bundles generated successfully.');
    })
    .catch(error => {
        console.error('❌ An error occurred during indexing:', error);
        process.exit(1);
    });
