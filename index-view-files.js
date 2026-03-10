import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const viewDir = path.resolve(__dirname, 'public/view');

/**
 * Recursively walks through directories starting from 'dir'.
 * In each directory (including the root viewDir), it lists only the files
 * directly in that directory and writes them to an 'index.txt' in that folder.
 */
function createFolderIndexes(dir) {
    const items = fs.readdirSync(dir);
    const files = [];

    for (const item of items) {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
            // Recursively process the subfolder
            createFolderIndexes(itemPath);
        } else {
            // Collect file names (excluding index.txt)
            if (item !== 'index.txt') {
                files.push(item);
            }
        }
    }

    // Create an index.txt if files (excluding index.txt) exist in this directory
    if (files.length > 0) {
        const indexFilePath = path.join(dir, 'index.txt');
        fs.writeFileSync(indexFilePath, files.join('\n'), 'utf8');
        console.log(`Created index.txt in: ${path.relative(viewDir, dir) || '.'}`);
    }
}

// Ensure the root directory exists
if (!fs.existsSync(viewDir)) {
    console.error(`Error: Directory ${viewDir} does not exist.`);
    process.exit(1);
}

try {
    console.log('Generating index.txt files in respective folders...');
    createFolderIndexes(viewDir);
    console.log('-------------------------------');
    console.log('Successfully updated folder-specific indexes.');
} catch (error) {
    console.error('An error occurred during indexing:', error);
    process.exit(1);
}
