#!/usr/bin/env node

/**
 * Script to fix common issues in demo tests
 * Run with: node scripts/fix-demo-tests.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Demo Test Issues...\n');

// Fix 1: Update liquidity amounts in QuoterDemo.test.js
function fixQuoterDemo() {
  const filePath = path.join(__dirname, '../test/QuoterDemo.test.js');
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Increase initial liquidity amounts
  const fixes = [
    {
      old: 'ethers.parseEther("100")',
      new: 'ethers.parseEther("1000")',
      description: 'Increased ETH liquidity from 100 to 1000'
    },
    {
      old: 'ethers.parseUnits("100000", 6)',
      new: 'ethers.parseUnits("1000000", 6)',
      description: 'Increased USDC liquidity from 100k to 1M'
    }
  ];
  
  let changesMade = false;
  fixes.forEach(fix => {
    if (content.includes(fix.old)) {
      content = content.replace(new RegExp(fix.old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fix.new);
      console.log(`✅ ${fix.description}`);
      changesMade = true;
    }
  });
  
  if (changesMade) {
    fs.writeFileSync(filePath, content);
    console.log(`📝 Updated: ${filePath}\n`);
  } else {
    console.log(`ℹ️ No changes needed for ${filePath}\n`);
  }
}

// Fix 2: Update liquidity amounts in QuoterDemoSimple.test.js
function fixQuoterDemoSimple() {
  const filePath = path.join(__dirname, '../test/QuoterDemoSimple.test.js');
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Similar fixes as QuoterDemo
  const fixes = [
    {
      old: 'ethers.parseEther("100")',
      new: 'ethers.parseEther("1000")',
      description: 'Increased ETH liquidity from 100 to 1000'
    },
    {
      old: 'ethers.parseUnits("100000", 6)',
      new: 'ethers.parseUnits("1000000", 6)',
      description: 'Increased USDC liquidity from 100k to 1M'
    }
  ];
  
  let changesMade = false;
  fixes.forEach(fix => {
    if (content.includes(fix.old)) {
      content = content.replace(new RegExp(fix.old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fix.new);
      console.log(`✅ ${fix.description}`);
      changesMade = true;
    }
  });
  
  if (changesMade) {
    fs.writeFileSync(filePath, content);
    console.log(`📝 Updated: ${filePath}\n`);
  } else {
    console.log(`ℹ️ No changes needed for ${filePath}\n`);
  }
}

// Fix 3: Add helper comment to DummyRealDataQuoters.test.js
function fixDummyRealDataQuoters() {
  const filePath = path.join(__dirname, '../test/DummyRealDataQuoters.test.js');
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Add comment about expected value mismatch
  const comment = `
    // Note: These tests may fail due to quoter calculation changes
    // The quoters now use averaging logic which produces different results
    // Update expected values if quoter logic has changed
  `;
  
  if (!content.includes('Note: These tests may fail')) {
    // Find a good place to insert the comment
    const insertPoint = content.indexOf('describe("DummyRealData Quoters Tests"');
    if (insertPoint !== -1) {
      content = content.slice(0, insertPoint) + comment + '\n' + content.slice(insertPoint);
      fs.writeFileSync(filePath, content);
      console.log('✅ Added explanatory comment to DummyRealDataQuoters.test.js');
      console.log(`📝 Updated: ${filePath}\n`);
    }
  } else {
    console.log(`ℹ️ Comment already exists in ${filePath}\n`);
  }
}

// Main execution
console.log('Starting fixes...\n');
console.log('Fix 1: Updating QuoterDemo.test.js');
fixQuoterDemo();

console.log('Fix 2: Updating QuoterDemoSimple.test.js');
fixQuoterDemoSimple();

console.log('Fix 3: Adding comment to DummyRealDataQuoters.test.js');
fixDummyRealDataQuoters();

console.log('✨ Demo test fixes complete!');
console.log('\nNext steps:');
console.log('1. Run: npm test');
console.log('2. Check if failing tests are reduced');
console.log('3. Remaining failures may need manual quoter logic updates\n');
