import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewDir = path.resolve(__dirname, 'public/view');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
    });
}

console.log("🚀 Starting Global Space Normalization...");

// 1. Rename physical files
walkDir(viewDir, (filePath) => {
    if (filePath.toLowerCase().endsWith('.csv')) {
        const dirName = path.dirname(filePath);
        const oldName = path.basename(filePath);
        if (oldName.includes('  ')) {
            const newName = oldName.replace(/  +/g, ' ');
            const newPath = path.join(dirName, newName);
            
            if (!fs.existsSync(newPath)) {
                fs.renameSync(filePath, newPath);
                console.log(`✅ Renamed: "${oldName}" -> "${newName}"`);
            } else {
                console.warn(`⚠ Collision: "${newName}" already exists. Skipping.`);
            }
        }
    }
});

// 2. Fix index.txt contents
walkDir(viewDir, (filePath) => {
    if (path.basename(filePath) === 'index.txt') {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes('  ')) {
            // Replace double spaces but handle the #v:timestamp carefully (though it shouldn't have spaces)
            const newContent = content.replace(/  +/g, ' ');
            fs.writeFileSync(filePath, newContent, 'utf8');
            console.log(`📝 Fixed Index: ${path.relative(viewDir, filePath)}`);
        }
    }
});

console.log("-------------------------------");
console.log("✨ Spaces Normalized Successfully.");
