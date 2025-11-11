#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const HARDHAT_PORT = 8545;

async function killHardhatNode() {
  try {
    await execPromise(`lsof -ti:${HARDHAT_PORT} | xargs kill -9 2>/dev/null || true`);
    console.log('✅ Hardhat node stopped');
  } catch {
    console.log('⚠️  No Hardhat node process found');
  }
}

async function startHardhatNode() {
  console.log('🚀 Starting Hardhat node...');
  const { spawn } = require('child_process');
  
  const nodeProcess = spawn('npx', ['hardhat', 'node'], {
    env: { ...process.env, MAINNET_RPC: '' },
    stdio: 'inherit',
    shell: true
  });

  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Hardhat node...');
    nodeProcess.kill();
    process.exit(0);
  });

  return nodeProcess;
}

const command = process.argv[2];

if (command === 'stop' || command === 'restart') {
  killHardhatNode().then(() => {
    if (command === 'restart') {
      startHardhatNode();
    }
  });
} else if (command === 'start') {
  startHardhatNode();
} else {
  console.log('Usage: node scripts/manageHardhatNode.js [start|stop|restart]');
  process.exit(1);
}

