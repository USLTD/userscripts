const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Make sure the _data directory exists for Jekyll
const dataDir = path.join(__dirname, '_data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const scripts = [];
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.user.js'));

// Get the repo name from GitHub Actions, or fallback to a placeholder
const repoName = process.env.GITHUB_REPOSITORY || 'USLTD/userscripts';

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  
  // Extract metadata using regex
  const name = (content.match(/@name\s+(.+)/) || [])[1]?.trim() || file;
  const version = (content.match(/@version\s+(.+)/) || [])[1]?.trim() || '1.0';
  const desc = (content.match(/@description\s+(.+)/) || [])[1]?.trim() || 'No description provided.';
  const updated = fs.statSync(file).mtime.toISOString().split('T')[0];
  const sizeKb = (fs.statSync(file).size / 1024).toFixed(2);

  // Fetch Git history for this specific file
  let history = [];
  try {
    // Gets the Commit Hash, Date, and Commit Message
    const log = execSync(`git log --pretty=format:"%H|%aI|%s" -- "${file}"`).toString().trim();
    if (log) {
      history = log.split('\n').map(line => {
        const [hash, date, msg] = line.split('|');
        return {
          hash: hash.substring(0, 7), // Short hash
          date: date.split('T')[0],
          message: msg,
          // Link directly to the raw file at this specific point in time
          url: `https://raw.githubusercontent.com/${repoName}/${hash}/${file}`
        };
      });
    }
  } catch (e) {
    console.warn(`Could not fetch git history for ${file}`);
  }

  // Remove the most recent commit from history since it's the "Current" version
  if (history.length > 0) history.shift(); 

  scripts.push({ filename: file, name, version, description: desc, updated, sizeKb, history });
}

// Save to _data/scripts.json so Jekyll can read it
fs.writeFileSync(path.join(dataDir, 'scripts.json'), JSON.stringify(scripts, null, 2));
console.log(`Successfully generated data for ${scripts.length} scripts.`);
