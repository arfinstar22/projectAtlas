#!/usr/bin/env node
/**
 * Build script that respects workspace dependency order.
 * Builds packages in topological order: core -> (ai, document) -> server, web
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const rootDir = process.cwd();
const packagesDir = join(rootDir, 'packages');
const appsDir = join(rootDir, 'apps');

// Build order based on dependencies
const buildOrder = [
  // Phase 1: No internal dependencies
  'packages/core',
  
  // Phase 2: Depends on core (can run in parallel)
  'packages/ai',
  'packages/document',
  
  // Phase 3: Depends on core, ai, document
  'apps/server',
  
  // Phase 4: No internal dependencies (but depends on server at runtime)
  'apps/web',
];

async function runBuild() {
  console.log('🏗️  Starting ordered build...\n');
  
  for (const pkgPath of buildOrder) {
    const fullPath = join(rootDir, pkgPath);
    const pkgName = fullPath.split('/').pop();
    
    try {
      console.log(`📦 Building ${pkgName}...`);
      execSync('npm run build', { 
        cwd: fullPath, 
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' }
      });
      console.log(`✅ ${pkgName} built successfully\n`);
    } catch (error) {
      console.error(`❌ Failed to build ${pkgName}`);
      process.exit(1);
    }
  }
  
  console.log('🎉 All packages built successfully!');
}

runBuild().catch(console.error);