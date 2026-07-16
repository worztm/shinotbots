#!/usr/bin/env node

/**
 * Shinotbot Cloudflare Setup Script
 * Run: npm run setup
 */

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function main() {
  console.log('🔧 Shinotbot Cloudflare Setup\n');
  console.log('This will:\n');
  console.log('  1. Create a KV namespace for data storage');
  console.log('  2. Set your Telegram bot token as a secret');
  console.log('  3. Deploy the worker');
  console.log('  4. Set up the Telegram webhook\n');

  // Step 1: Create KV namespace
  console.log('📦 Step 1: Creating KV namespace...');
  try {
    const kvOutput = execSync('wrangler kv namespace create "DB"', { encoding: 'utf8' });
    console.log(kvOutput);

    // Extract the ID from the output
    const idMatch = kvOutput.match(/"id":\s*"([^"]+)"/);
    if (idMatch) {
      const kvId = idMatch[1];
      console.log(`\n✅ KV namespace created: ${kvId}`);
      console.log('\n📝 Updating wrangler.toml...');

      // Update wrangler.toml with the real ID
      const fs = require('fs');
      let toml = fs.readFileSync('wrangler.toml', 'utf8');
      toml = toml.replace('YOUR_KV_NAMESPACE_ID', kvId);
      fs.writeFileSync('wrangler.toml', toml);
      console.log('✅ wrangler.toml updated\n');
    }
  } catch (err) {
    console.error('❌ Failed to create KV namespace:', err.message);
    console.log('\nMake sure you are logged in: wrangler login');
    process.exit(1);
  }

  // Step 2: Set Telegram bot token
  console.log('🔑 Step 2: Setting Telegram bot token...');
  const token = await ask('\nEnter your Telegram bot token: ');
  if (!token.trim()) {
    console.log('❌ No token provided. Exiting.');
    process.exit(1);
  }

  try {
    execSync(`wrangler secret put TELEGRAM_BOT_TOKEN`, {
      input: token.trim(),
      stdio: 'inherit',
    });
    console.log('\n✅ Telegram bot token saved as secret\n');
  } catch (err) {
    console.error('❌ Failed to set secret:', err.message);
    process.exit(1);
  }

  // Step 3: Deploy
  console.log('🚀 Step 3: Deploying worker...');
  try {
    const deployOutput = execSync('wrangler deploy', { encoding: 'utf8' });
    console.log(deployOutput);

    // Extract the URL
    const urlMatch = deployOutput.match(/https:\/\/[^\s]+/);
    const workerUrl = urlMatch ? urlMatch[0] : null;

    if (workerUrl) {
      console.log(`\n✅ Worker deployed to: ${workerUrl}\n`);

      // Step 4: Set up webhook
      console.log('🔗 Step 4: Setting up Telegram webhook...');
      try {
        const setupRes = execSync(`curl -s -X POST "${workerUrl}/setup" -H "Content-Type: application/json" -d '{"webhook_url":"${workerUrl}"}'`, {
          encoding: 'utf8',
        });
        console.log(setupRes);
        console.log('\n✅ Webhook configured!\n');
      } catch (err) {
        console.log('\n⚠️  Webhook setup failed. Run this manually after deploy:');
        console.log(`   curl -X POST "${workerUrl}/setup" -H "Content-Type: application/json" -d '{"webhook_url":"${workerUrl}"}'`);
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ Setup complete!');
      console.log(`\n📱 Your bot is live at: ${workerUrl}`);
      console.log(`\n📋 Next steps:`);
      console.log(`   1. Open Telegram and find your bot`);
      console.log(`   2. Send /start`);
      console.log(`   3. Send /connect and paste your GitHub PAT`);
      console.log(`   4. You'll start getting notifications!\n`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  } catch (err) {
    console.error('❌ Deployment failed:', err.message);
    process.exit(1);
  }

  rl.close();
}

main().catch(console.error);
