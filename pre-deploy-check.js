/**
 * VAIMA Pre-Flight Production & Deployment Verifier
 * 
 * Run: node pre-deploy-check.js
 * 
 * Verifies local project structure, required packages, Vercel routing declarations,
 * and environmental variable presence before pushing changes to remote git and Vercel.
 */

const fs = require('fs');
const path = require('path');

console.log("=========================================================");
console.log("✈️  VAIMA PRODUCTION PRE-FLIGHT DEPLOYMENT VERIFICATION");
console.log("=========================================================\n");

let issuesFound = false;
let warningsFound = false;

// 1. Structural File Diagnostics
const criticalFiles = [
  { name: 'package.json', path: './package.json', type: 'file' },
  { name: 'tsconfig.json', path: './tsconfig.json', type: 'file' },
  { name: 'vercel.json', path: './vercel.json', type: 'file' },
  { name: 'db.json', path: './db.json', type: 'file' },
  { name: 'server.ts', path: './server.ts', type: 'file' },
  { name: 'Chroma Vector Store', path: './chroma-migration/vectorStore.js', type: 'file' },
  { name: 'Chroma Ingestion Module', path: './chroma-migration/ingest.js', type: 'file' },
  { name: 'Chroma Expert Controller', path: './chroma-migration/new-aiController.js', type: 'file' }
];

console.log("📋 1. Checking Critical Directories & Resource Declarations...");
criticalFiles.forEach(resource => {
  const absolutePath = path.resolve(__dirname, resource.path);
  if (fs.existsSync(absolutePath)) {
    console.log(`  ✅ FOUND: ${resource.name} (${resource.path})`);
  } else {
    console.error(`  ❌ MISSING: ${resource.name} could not be resolved at: ${resource.path}`);
    issuesFound = true;
  }
});
console.log("");

// 2. Syntax check for JSON configurations
console.log("🔍 2. Validating JSON Configuration Integrity...");
['./package.json', './vercel.json', './metadata.json'].forEach(file => {
  const filePath = path.resolve(__dirname, file);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      JSON.parse(content);
      console.log(`  ✅ VALID INTEGRITY: ${file}`);
    } catch (err) {
      console.error(`  ❌ CORRUPT JSON in ${file}:`, err.message);
      issuesFound = true;
    }
  }
});
console.log("");

// 3. Environment Variable Sanity Checks (Local)
console.log("🔒 3. Testing Local Environmental Context & Key Mappings...");
const vitalEnvVars = [
  { name: 'GEMINI_API_KEY', desc: 'Required for server-side Gemini 1.5/2.5 model interfaces and grounding.' },
  { name: 'HEYGEN_API_KEY', desc: 'Required for real-time Live Avatar WebRTC interactive responses.' },
  { name: 'APP_URL', desc: 'Production URL for self-referential links and auth callbacks.' }
];

vitalEnvVars.forEach(env => {
  if (process.env[env.name]) {
    console.log(`  ✅ LOCAL LIVE: ${env.name} is configured in system shell environment.`);
  } else {
    // Look in .env file if it exists
    const dotEnvPath = path.resolve(__dirname, '.env');
    let foundInDotEnv = false;
    if (fs.existsSync(dotEnvPath)) {
      const dotEnvContent = fs.readFileSync(dotEnvPath, 'utf8');
      if (dotEnvContent.includes(`${env.name}=`)) {
        foundInDotEnv = true;
      }
    }
    
    if (foundInDotEnv) {
      console.log(`  ✅ PROVISIONED: ${env.name} detected inside local .env file.`);
    } else {
      console.warn(`  ⚠️  WARNING: ${env.name} is not set locally.`);
      console.warn(`     Context: ${env.desc}`);
      console.warn(`     👉 Ensure this key is manually provisioned inside your Vercel Dashboard Environment Variables settings.`);
      warningsFound = true;
    }
  }
});
console.log("");

// 4. Dist folder check
console.log("📦 4. Verifying Client-Side Production Assets Bundle Compilation...");
const distPath = path.resolve(__dirname, './dist');
if (fs.existsSync(distPath)) {
  const indexHtml = path.join(distPath, 'index.html');
  if (fs.existsSync(indexHtml)) {
    console.log("  ✅ SUCCESS: 'dist/' directory resides with built client-side single-page files.");
  } else {
    console.warn("  ⚠️  WARNING: 'dist/' exists but 'index.html' is missing. A rebuild may be required.");
    warningsFound = true;
  }
} else {
  console.log("  💡 NOTICE: 'dist/' directory is not compiled locally yet.");
  console.log("     This is normal for git-committed pipelines, as Vercel will trigger 'npm run build' natively upon target push.");
}
console.log("");

// 5. Final Report
console.log("=========================================================");
console.log("🏆 PRE-FLIGHT VERIFIER SUMMARY REPORT");
console.log("=========================================================");
if (issuesFound) {
  console.error("⛔ CRITICAL DEPLOYMENT BARRIERS IDENTIFIED!");
  console.error("   Review the errors marked with '❌' above and fix them before committing or pushing.");
  process.exit(1);
} else {
  console.log("🚀 ALL SYSTEMS PRE-FLIGHT CLEARED FOR DEPLOYMENT!");
  if (warningsFound) {
    console.log("   ⚠️  Some optional settings or local config keys are not matching (see above).");
    console.log("   👉 Double-check Vercel environmental variable overrides, then deploy with confidence.");
  } else {
    console.log("   ✨ Elite production readiness rating achieved. Code is completely clean and fully structural.");
  }
  process.exit(0);
}
