#!/usr/bin/env node

const { spawn } = require('child_process');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const HARDHAT_PORT = 8545;
const HARDHAT_RPC = `http://127.0.0.1:${HARDHAT_PORT}`;

async function checkNodeRunning() {
  try {
    const http = require('http');
    return new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: HARDHAT_PORT,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 2000
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.result !== undefined);
          } catch {
            resolve(false);
          }
        });
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1
      }));
      req.end();
    });
  } catch {
    return false;
  }
}

async function checkGasPrice() {
  try {
    const http = require('http');
    return new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: HARDHAT_PORT,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 2000
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.result && json.result.baseFeePerGas) {
              const baseFee = BigInt(json.result.baseFeePerGas);
              const threshold = BigInt('5000000000'); // 5 gwei
              resolve(baseFee > threshold);
            } else {
              resolve(false);
            }
          } catch {
            resolve(false);
          }
        });
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
        id: 1
      }));
      req.end();
    });
  } catch {
    return false;
  }
}

async function killHardhatNode() {
  console.log('🛑 Stopping Hardhat node...');
  try {
    // Find and kill Hardhat node processes
    await execPromise(`lsof -ti:${HARDHAT_PORT} | xargs kill -9 2>/dev/null || true`);
    // Wait a moment for port to be released
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('✅ Hardhat node stopped');
  } catch (error) {
    console.log('⚠️  No Hardhat node process found (or already stopped)');
  }
}

async function startHardhatNode() {
  console.log('🚀 Starting fresh Hardhat node...');
  
  return new Promise((resolve, reject) => {
    const nodeProcess = spawn('npx', ['hardhat', 'node'], {
      env: { ...process.env, MAINNET_RPC: '' },
      stdio: 'pipe',
      shell: true
    });

    let output = '';
    let resolved = false;
    nodeProcess.stdout.on('data', (data) => {
      output += data.toString();
      if (!resolved && (output.includes('Started HTTP') || output.includes('Account #0'))) {
        resolved = true;
        console.log('✅ Hardhat node started successfully');
        resolve(nodeProcess);
      }
    });

    nodeProcess.stderr.on('data', (data) => {
      const text = data.toString();
      if (!text.includes('Warning')) {
        process.stderr.write(data);
      }
    });

    nodeProcess.on('error', reject);

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!output.includes('Started HTTP')) {
        reject(new Error('Hardhat node startup timeout'));
      }
    }, 10000);
  });
}

async function waitForNode(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkNodeRunning()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function main() {
  console.log('🔍 Checking Hardhat node status...\n');

  const nodeRunning = await checkNodeRunning();
  let needsRestart = false;

  if (nodeRunning) {
    console.log('✅ Hardhat node is running');
    const gasTooHigh = await checkGasPrice();
    if (gasTooHigh) {
      console.log('⚠️  Gas prices are too high - node needs restart');
      needsRestart = true;
    } else {
      console.log('✅ Gas prices are normal');
    }
  } else {
    console.log('⚠️  Hardhat node is not running');
    needsRestart = true;
  }

  if (needsRestart) {
    await killHardhatNode();
    const nodeProcess = await startHardhatNode();
    
    console.log('⏳ Waiting for node to be ready...');
    const ready = await waitForNode();
    if (!ready) {
      console.error('❌ Node failed to start');
      process.exit(1);
    }

    // Keep node process reference for cleanup
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down Hardhat node...');
      nodeProcess.kill();
      process.exit(0);
    });

    console.log('\n✅ Hardhat node is ready!\n');
  }

  // Now deploy contracts
  console.log('📦 Deploying contracts...\n');
  const deployProcess = spawn('npx', ['hardhat', 'run', 'scripts/deployStoixTestPool.js', '--network', 'localhost'], {
    env: { ...process.env, MAINNET_RPC: '' },
    stdio: 'inherit',
    shell: true
  });

  deployProcess.on('close', (code) => {
    if (code === 0) {
      console.log('\n✅ Deployment completed successfully!');
    } else {
      console.error(`\n❌ Deployment failed with code ${code}`);
      process.exit(code);
    }
  });
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

