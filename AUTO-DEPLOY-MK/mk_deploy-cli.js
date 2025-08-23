#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { program } = require('commander');
const ftp = require('basic-ftp');
const fetch = require('node-fetch');
const glob = require('fast-glob');
const { execSync } = require('child_process');

// CLI Setup
program
  .version('1.0.0')
  .description('Robust deployment CLI for web projects')
  .option('-p, --project <project>', 'Project to deploy', 'web')
  .option('-t, --target <target>', 'Deployment target', 'production')  
  .option('-P, --parts <parts>', 'Parts to deploy (comma-separated)', 'default')
  .option('-m, --method <method>', 'Deployment method (ftp|copy|ssh)')
  .option('-d, --dry-run', 'Show what would be deployed without uploading')
  .option('-f, --force', 'Force rebuild and overwrite')
  .option('-b, --build', 'Run build before deployment')
  .option('-v, --verbose', 'Verbose logging');

// Global state
let config = null;
let manifest = {
  timestamp: new Date().toISOString(),
  project: '',
  target: '',
  parts: [],
  files: [],
  verification: null,
  success: false
};

// Utility functions
function log(level, message) {
  const timestamp = new Date().toISOString().substring(11, 19);
  const colors = {
    ERROR: '\x1b[31m',
    WARN: '\x1b[33m', 
    SUCCESS: '\x1b[32m',
    INFO: '\x1b[36m',
    STEP: '\x1b[35m',
    RESET: '\x1b[0m'
  };
  
  console.log(`${colors[level] || ''}[${timestamp}] [${level}] ${message}${colors.RESET}`);
}

// Smart path combination for multiple domains in one hosting folder
function createWebUrl(targetConfig, filePath) {
  const domain = targetConfig.domain;
  
  // For our specific case: convert FTP path to web URL
  // FTP: /11seconds.de/httpdocs/admin/file.txt -> Web: https://11seconds.de/admin/file.txt
  // We need to remove the FTP server path prefix and keep only the web-relative part
  
  let webPath = filePath;
  
  // Remove the remoteRoot prefix to get web-relative path
  if (targetConfig.remoteRoot && filePath.includes(targetConfig.remoteRoot)) {
    // Remove the remoteRoot from the beginning of filePath
    webPath = filePath.replace(targetConfig.remoteRoot, '');
  } else if (filePath.includes('/httpdocs/')) {
    // Fallback: remove everything up to and including /httpdocs/
    webPath = filePath.substring(filePath.indexOf('/httpdocs/') + '/httpdocs'.length);
  }
  
  // Ensure webPath starts with /
  if (!webPath.startsWith('/')) {
    webPath = '/' + webPath;
  }

  // If the target domain is a subdomain like admin.11seconds.de and the webPath begins with
  // the last segment ("/admin"), we should map the file to the subdomain root (avoid /admin duplication)
  try {
    const hostParts = domain.split('.');
    const subdomain = hostParts.length > 2 ? hostParts[0] : null;
    if (subdomain) {
      // if webPath starts with /{subdomain}, strip it
      const candidate = '/' + subdomain;
      if (webPath.startsWith(candidate + '/') || webPath === candidate) {
        webPath = webPath.substring(candidate.length) || '/';
      }
    }
  } catch (e) {
    // ignore parsing errors and fallback to default
  }

  // Construct final URL
  const webUrl = `https://${domain}${webPath}`;
  
  if (program.opts().verbose) {
    log('INFO', `URL Construction: ${filePath} -> ${webUrl}`);
  }
  
  return webUrl;
}

function loadConfig() {
  const configPath = path.join(__dirname, 'mk_deployment-config.yaml');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }
  
  let configContent = fs.readFileSync(configPath, 'utf8');
  
  // Replace environment variables
  configContent = configContent.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return process.env[varName] || match;
  });
  
  const parsedConfig = yaml.load(configContent);
  log('SUCCESS', `Configuration loaded from ${configPath}`);
  return parsedConfig;
}

function resolveProjectFiles(projectConfig, parts, excludes) {
  const files = [];
  const partsArray = parts.split(',').map(p => p.trim());
  
  log('STEP', `Resolving files for parts: ${partsArray.join(', ')}`);
  
  for (const partName of partsArray) {
    const part = projectConfig.parts[partName];
    if (!part) {
      throw new Error(`Part '${partName}' not found in project configuration`);
    }
    
    const basePath = projectConfig.localBuild || projectConfig.localSource;
    if (!fs.existsSync(basePath)) {
      throw new Error(`Source path not found: ${basePath}`);
    }
    
    // Get included files
    const includePatterns = part.include.map(pattern => 
      path.join(basePath, pattern).replace(/\\/g, '/')
    );
    
    const matchedFiles = glob.sync(includePatterns, { 
      dot: false,
      ignore: excludes.map(ex => path.join(basePath, ex).replace(/\\/g, '/'))
    });
    
    for (const filePath of matchedFiles) {
      const relativePath = path.relative(basePath, filePath);
      const remotePath = path.join(part.remotePath || '/', relativePath).replace(/\\/g, '/');
      const webPath = path.join(part.webPath || part.remotePath || '/', relativePath).replace(/\\/g, '/');
      
      files.push({
        localPath: filePath,
        relativePath: relativePath,
        remotePath: remotePath,
        webPath: webPath,
        part: partName,
        size: fs.statSync(filePath).size
      });
    }
    
    log('INFO', `Part '${partName}': found ${matchedFiles.length} files`);
  }
  
  return files;
}

function validatePathMappings(projectConfig, targetConfig) {
  log('STEP', 'Validating path mappings...');
  
  // Check source directory (for building)
  const localSource = projectConfig.localSource;
  if (!fs.existsSync(localSource)) {
    throw new Error(`Local source path not found: ${localSource}`);
  }
  log('INFO', `✓ Local source exists: ${localSource}`);
  
  // Check build directory (for deployment) - this might not exist if build hasn't run yet
  const buildPath = projectConfig.localBuild || localSource;
  if (fs.existsSync(buildPath)) {
    log('INFO', `✓ Build path exists: ${buildPath}`);
  } else {
    log('WARN', `Build path not found: ${buildPath} (will be created during build)`);
  }
  
  if (targetConfig.method === 'ftp') {
    log('INFO', `✓ Remote target: ${targetConfig.ftp.host}${targetConfig.remoteRoot}`);
  } else if (targetConfig.method === 'copy') {
    log('INFO', `✓ Local target: ${targetConfig.localPath}`);
  }
  
  log('SUCCESS', 'Path mappings validated');
}

async function runBuild(projectConfig) {
  if (!projectConfig.buildCommand) {
    log('INFO', 'No build command configured');
    return true;
  }
  
  const buildDir = path.join(projectConfig.localSource, 'build');
  if (fs.existsSync(buildDir) && !program.opts().force) {
    log('INFO', 'Build directory exists, skipping build (use --force to rebuild)');
    return true;
  }
  
  log('STEP', `Running build: ${projectConfig.buildCommand}`);
  
  try {
    process.chdir(projectConfig.localSource);
    execSync(projectConfig.buildCommand, { stdio: 'inherit' });
    log('SUCCESS', 'Build completed successfully');
    return true;
  } catch (error) {
    log('ERROR', `Build failed: ${error.message}`);
    return false;
  }
}

function createVerificationFile(projectConfig, targetConfig) {
  if (!projectConfig.verify?.enabled) {
    return null;
  }
  
  const timestamp = Date.now();
  const fileName = projectConfig.verify.fileTemplate.replace('{timestamp}', timestamp);
  const content = `<!DOCTYPE html>
<html>
<head>
    <title>Deployment Verification</title>
</head>
<body>
    <h1>Deployment Verification</h1>
    <p>Deployed at: ${new Date().toISOString()}</p>
    <p>Timestamp: ${timestamp}</p>
    <p>Target: ${program.opts().target}</p>
    <p>Project: ${program.opts().project}</p>
</body>
</html>`;
  
  const buildPath = projectConfig.localBuild || projectConfig.localSource;
  const filePath = path.join(buildPath, fileName);
  
  fs.writeFileSync(filePath, content);
  log('SUCCESS', `Verification file created: ${fileName}`);
  
  const url = projectConfig.verify.urlTemplate
    .replace('{domain}', targetConfig.domain)
    .replace('{file}', fileName);
    
  return {
    fileName,
    filePath,
    url,
    content,
    timestamp
  };
}

async function testFTPConnection(ftpConfig) {
  log('STEP', `Testing FTP connection to ${ftpConfig.host}...`);
  
  const client = new ftp.Client();
  client.ftp.timeout = ftpConfig.timeout || 30000;
  
  try {
    await client.access({
      host: ftpConfig.host,
      user: ftpConfig.user,
      password: ftpConfig.password,
      secure: false
    });
    
    log('SUCCESS', 'FTP connection successful');
    await client.close();
    return true;
  } catch (error) {
    log('ERROR', `FTP connection failed: ${error.message}`);
    return false;
  }
}

async function uploadViaFTP(files, ftpConfig, remoteRoot, targetConfig) {
  log('STEP', `Uploading ${files.length} files via FTP...`);
  
  const client = new ftp.Client();
  client.ftp.timeout = ftpConfig.timeout || 30000;
  
  try {
    await client.access({
      host: ftpConfig.host,
      user: ftpConfig.user,
      password: ftpConfig.password,
      secure: false
    });
    
    let successCount = 0;
    let failCount = 0;
    
    // Create timestamp verification file
    const timestamp = new Date().toISOString();
    const timestampFileName = `deploy-timestamp-${Date.now()}.txt`;
    const timestampContent = `Deployment completed at: ${timestamp}\nFiles uploaded: ${files.length}\nTarget: ${program.opts().target}\nProject: ${program.opts().project}`;
    const timestampTempPath = path.join(process.cwd(), timestampFileName);
    fs.writeFileSync(timestampTempPath, timestampContent);
    
    // Add timestamp file to upload list - prefer placing it under the part's configured webPath
    const firstFile = files[0];
    // Determine the target folder (use part.webPath if available, otherwise fallback to dirname of first file)
    let targetFolder = '/';
    try {
      if (firstFile && firstFile.part) {
        // find the part definition in config.projects to get webPath/remotePath
        const proj = config.projects[program.opts().project];
        const partDef = proj.parts[firstFile.part];
        if (partDef && partDef.remotePath) {
          targetFolder = partDef.remotePath;
        } else if (firstFile.remotePath) {
          targetFolder = path.dirname(firstFile.remotePath);
        }
      } else if (firstFile && firstFile.remotePath) {
        targetFolder = path.dirname(firstFile.remotePath);
      } else {
        targetFolder = '/admin';
      }
    } catch (e) {
      targetFolder = path.dirname(firstFile?.remotePath || '/admin');
    }

    // Normalize target folder and build remote path
    if (!targetFolder.startsWith('/')) targetFolder = '/' + targetFolder;

    const timestampFile = {
      localPath: timestampTempPath,
      relativePath: timestampFileName,
      remotePath: path.posix.join(targetFolder, timestampFileName),
      webPath: path.posix.join(targetFolder, timestampFileName),
      size: Buffer.byteLength(timestampContent)
    };

    for (const file of [...files, timestampFile]) {
      try {
        // DEBUG: Log the path calculation
        if (program.opts().verbose) {
          log('INFO', `DEBUG: remoteRoot="${remoteRoot}", file.remotePath="${file.remotePath}"`);
        }
        
        const remotePath = path.join(remoteRoot, file.remotePath).replace(/\\/g, '/');
        
        if (program.opts().verbose) {
          log('INFO', `DEBUG: Final FTP path="${remotePath}"`);
        }
        
        const remoteDir = path.dirname(remotePath);
        
        // Ensure directory exists
        try {
          await client.ensureDir(remoteDir);
        } catch (dirError) {
          // Directory might already exist
        }

        await client.uploadFrom(file.localPath, remotePath);
        successCount++;
        
        if (program.opts().verbose) {
          log('INFO', `✓ ${file.relativePath} → ${remotePath}`);
        }
        
        // Immediate verification for critical files
        if (file === timestampFile) {
          log('STEP', 'Verifying timestamp file upload immediately...');
          try {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            const verifyUrl = createWebUrl(targetConfig, file.remotePath);
            log('INFO', `Verifying URL: ${verifyUrl}`);
            const verifyResponse = await fetch(verifyUrl, { timeout: 5000 });
            if (verifyResponse.ok) {
              const content = await verifyResponse.text();
              if (content.includes(timestamp)) {
                log('SUCCESS', '✓ Timestamp file verified immediately after upload');
              } else {
                log('WARN', '⚠ Timestamp file uploaded but content mismatch');
              }
            } else {
              log('WARN', `⚠ Timestamp file not immediately accessible (${verifyResponse.status})`);
            }
          } catch (verifyError) {
            log('WARN', `⚠ Immediate verification failed: ${verifyError.message}`);
          }
        }
        
      } catch (error) {
        failCount++;
        log('ERROR', `✗ ${file.relativePath}: ${error.message}`);
      }
    }
    
    // Clean up local timestamp file
    try {
      fs.unlinkSync(timestampTempPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }    await client.close();
    
    log('SUCCESS', `FTP upload completed: ${successCount} success, ${failCount} failed`);
    return failCount === 0;
    
  } catch (error) {
    log('ERROR', `FTP upload failed: ${error.message}`);
    return false;
  }
}

function deployViaCopy(files, targetPath) {
  log('STEP', `Copying ${files.length} files to ${targetPath}...`);
  
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }
  
  let successCount = 0;
  let failCount = 0;
  
  for (const file of files) {
    try {
      const destPath = path.join(targetPath, file.relativePath);
      const destDir = path.dirname(destPath);
      
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      fs.copyFileSync(file.localPath, destPath);
      successCount++;
      
      if (program.opts().verbose) {
        log('INFO', `✓ ${file.relativePath} → ${destPath}`);
      }
    } catch (error) {
      failCount++;
      log('ERROR', `✗ ${file.relativePath}: ${error.message}`);
    }
  }
  
  log('SUCCESS', `Local copy completed: ${successCount} success, ${failCount} failed`);
  return failCount === 0;
}

async function verifyDeployment(verificationFile, targetConfig) {
  log('STEP', 'Verifying deployment...');
  
  const verificationResults = {
    mainPage: false,
    assetManifest: false,
    deploymentTimestamp: false,
    verificationFile: false
  };
  
  // Test 1: Check main page loads
  try {
    const mainPageUrl = `https://${targetConfig.domain}/`;
    log('INFO', `Testing main page: ${mainPageUrl}`);
    
    const response = await fetch(mainPageUrl, {
      timeout: config.defaults.verification.httpTimeout || 10000,
      headers: {
        'User-Agent': 'MK-Deploy-Verification/1.0',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (response.ok) {
      const content = await response.text();
      verificationResults.mainPage = true;
      log('SUCCESS', '✓ Main page accessible');
      
      // Check for deployment timestamp in title
      if (content.includes('23.08.2025 14:22')) {
        verificationResults.deploymentTimestamp = true;
        log('SUCCESS', '✓ Deployment timestamp found in page');
      } else {
        log('WARN', '⚠ Deployment timestamp not found - might be cached');
      }
    } else {
      log('ERROR', `✗ Main page returned HTTP ${response.status}`);
    }
  } catch (error) {
    log('ERROR', `✗ Main page test failed: ${error.message}`);
  }
  
  // Test 2: Check asset-manifest.json (for main site verification)
  try {
    const manifestUrl = createWebUrl(targetConfig, '/asset-manifest.json');
    log('INFO', `Testing asset manifest: ${manifestUrl}`);
    
    const response = await fetch(manifestUrl, {
      timeout: 5000,
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    
    if (response.ok) {
      const manifestData = await response.json();
      if (manifestData.files && manifestData.files['main.js']) {
        verificationResults.assetManifest = true;
        log('SUCCESS', '✓ Asset manifest contains expected files');
      } else {
        log('WARN', '⚠ Asset manifest has different structure - might be old version');
      }
    } else {
      log('ERROR', `✗ Asset manifest returned HTTP ${response.status}`);
    }
  } catch (error) {
    log('ERROR', `✗ Asset manifest test failed: ${error.message}`);
  }
  
  // Test 3: Check verification file (if exists)
  if (verificationFile) {
    try {
      const response = await fetch(verificationFile.url, {
        timeout: 5000,
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        const content = await response.text();
        if (content.includes(verificationFile.timestamp.toString())) {
          verificationResults.verificationFile = true;
          log('SUCCESS', `✓ Verification file accessible: ${verificationFile.url}`);
        } else {
          log('ERROR', `✗ Verification file content mismatch`);
        }
      } else {
        log('ERROR', `✗ Verification file HTTP ${response.status}: ${verificationFile.url}`);
      }
    } catch (error) {
      log('ERROR', `✗ Verification file failed: ${error.message}`);
    }
  }
  
  // Summary
  const successCount = Object.values(verificationResults).filter(Boolean).length;
  const totalTests = verificationFile ? 4 : 3;
  
  log('INFO', `Verification Results: ${successCount}/${totalTests} tests passed`);
  
  if (verificationResults.mainPage && verificationResults.assetManifest) {
    log('SUCCESS', '🎉 Core deployment verification successful!');
    return true;
  } else if (verificationResults.mainPage) {
    log('WARN', '⚠ Main page works but assets might be cached. Deployment likely successful.');
    return true;
  } else {
    log('ERROR', '❌ Core verification failed - deployment may not be live');
    return false;
  }
}

function saveManifest() {
  const manifestPath = path.join(__dirname, 'manifests', `deploy-${manifest.timestamp.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  log('SUCCESS', `Deployment manifest saved: ${path.basename(manifestPath)}`);
}

// Main deployment function
async function main() {
  try {
    program.parse();
    const options = program.opts();
    
    // Load configuration
    config = loadConfig();
    
    // Get project and target config
    const projectConfig = config.projects[options.project];
    if (!projectConfig) {
      throw new Error(`Project '${options.project}' not found in configuration`);
    }

    const targetConfig = config.targets[options.target];
    if (!targetConfig) {
      throw new Error(`Target '${options.target}' not found in configuration`);
    }
    
    // Validate environment variables for FTP deployments
    if (targetConfig.method === 'ftp') {
      const ftpUser = process.env.FTP_USER;
      const ftpPassword = process.env.FTP_PASSWORD;
      
      if (!ftpUser || !ftpPassword) {
        log('ERROR', '❌ Missing FTP credentials in environment variables');
        log('INFO', 'Please set: $env:FTP_USER = "k302164_11s" ; $env:FTP_PASSWORD = "hallo.411S"');
        throw new Error('FTP credentials not configured');
      }
      
      log('SUCCESS', '✓ FTP credentials found in environment');
      if (options.verbose) {
        log('INFO', `FTP User: ${ftpUser}`);
        log('INFO', `FTP Host: ${targetConfig.ftp.host}`);
        log('INFO', `Remote Root: ${targetConfig.remoteRoot}`);
      }
    }
    
    // Setup manifest
    manifest.project = options.project;
    manifest.target = options.target;
    manifest.parts = options.parts.split(',').map(p => p.trim());
    
    log('INFO', `Starting deployment: ${options.project} → ${options.target} (${options.parts})`);
    
    // Validate path mappings early
    validatePathMappings(projectConfig, targetConfig);
    
    // Run build if requested
    if (options.build && !await runBuild(projectConfig)) {
      throw new Error('Build failed');
    }
    
    // Resolve files to deploy
    const files = resolveProjectFiles(projectConfig, options.parts, config.defaults.excludes);
    manifest.files = files.map(f => ({ 
      relativePath: f.relativePath, 
      remotePath: f.remotePath, 
      size: f.size, 
      part: f.part 
    }));
    
    if (files.length === 0) {
      throw new Error('No files found to deploy');
    }
    
    log('INFO', `Found ${files.length} files to deploy (${files.reduce((sum, f) => sum + f.size, 0)} bytes)`);
    
    // Create verification file
    const verificationFile = createVerificationFile(projectConfig, targetConfig);
    if (verificationFile) {
      files.push({
        localPath: verificationFile.filePath,
        relativePath: verificationFile.fileName,
        remotePath: `/${verificationFile.fileName}`,
        part: 'verification',
        size: fs.statSync(verificationFile.filePath).size
      });
    }
    
    // Dry run mode
    if (options.dryRun) {
      log('INFO', '=== DRY RUN MODE ===');
      log('INFO', `Would deploy to: ${targetConfig.method} ${targetConfig.ftp?.host || targetConfig.localPath}`);
      files.forEach(file => {
        log('INFO', `  ${file.relativePath} → ${file.remotePath} (${file.size} bytes)`);
      });
      process.exit(0);
    }
    
    // Deploy files
    let deploySuccess = false;
    const method = options.method || targetConfig.method;
    
    if (method === 'ftp') {
      if (!await testFTPConnection(targetConfig.ftp)) {
        throw new Error('FTP connection test failed');
      }
      deploySuccess = await uploadViaFTP(files, targetConfig.ftp, targetConfig.remoteRoot, targetConfig);
    } else if (method === 'copy') {
      deploySuccess = deployViaCopy(files, targetConfig.localPath);
    } else {
      throw new Error(`Unsupported deployment method: ${method}`);
    }
    
    if (!deploySuccess) {
      throw new Error('File deployment failed');
    }
    
    // Verify deployment
    const verifySuccess = await verifyDeployment(verificationFile, targetConfig);
    manifest.verification = verificationFile ? {
      url: verificationFile.url,
      success: verifySuccess
    } : null;
    
    // Clean up verification file if successful
    if (verificationFile && verifySuccess && config.defaults.verification.cleanupVerificationFile) {
      try {
        fs.unlinkSync(verificationFile.filePath);
        log('INFO', 'Verification file cleaned up');
      } catch (error) {
        log('WARN', `Failed to clean up verification file: ${error.message}`);
      }
    }
    
    manifest.success = verifySuccess;
    saveManifest();
    
    if (verifySuccess) {
      log('SUCCESS', '🚀 Deployment completed successfully!');
      if (verificationFile) {
        log('INFO', `Verify at: ${verificationFile.url}`);
      }
      process.exit(0);
    } else {
      throw new Error('Deployment verification failed');
    }
    
  } catch (error) {
    log('ERROR', error.message);
    manifest.success = false;
    manifest.error = error.message;
    saveManifest();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main, loadConfig, resolveProjectFiles };
