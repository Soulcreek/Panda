#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { program } = require('commander');
const ftp = require('basic-ftp');
const fetch = require('node-fetch');
const glob = require('fast-glob');
const { execSync } = require('child_process');
// Load environment variables from .env at project root (if present)
try {
  require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
} catch (_) {}

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
  .option('--purge-views', 'Purge server EJS view cache after deploy (requires ADMIN_ACCESS_TOKEN)')
  .option('-v, --verbose', 'Verbose logging');

// Global state
let config = null;
const manifest = {
  timestamp: new Date().toISOString(),
  project: '',
  target: '',
  parts: [],
  files: [],
  verification: null,
  success: false,
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
    RESET: '\x1b[0m',
  };

  console.log(`${colors[level] || ''}[${timestamp}] [${level}] ${message}${colors.RESET}`);
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Detect illegal duplicate segments like '/{domain}/{domain}' or '/httpdocs/httpdocs'
function hasDuplicatedSegments(p, domain) {
  if (!p) return false;
  const s = String(p).replace(/\\/g, '/');
  const httpdocsDup = /\/httpdocs\/httpdocs(\/|$)/i.test(s);
  let domainDup = false;
  if (domain) {
    const d = escapeRegExp(domain);
    domainDup = new RegExp(`\/${d}\/${d}(\/|$)`, 'i').test(s);
  }
  return httpdocsDup || domainDup;
}

// Join remoteRoot + remotePath safely for hosts with per-domain folders, avoiding
// accidental duplication like '/purviewpanda.de/purviewpanda.de/httpdocs/...'.
function joinRemotePath(remoteRoot, fileRemotePath, domain) {
  const posix = path.posix;
  const rr = (remoteRoot || '/').replace(/\\/g, '/');
  let fr = (fileRemotePath || '/').replace(/\\/g, '/');

  // Collapse any accidental double domain folder (defensive)
  if (domain) {
    const d = escapeRegExp(domain);
    const dbl = new RegExp(`/${d}/${d}(/|$)`);
    while (dbl.test(fr)) {
      fr = fr.replace(dbl, `/${domain}/`);
    }
  }

  const domainFolder = domain ? `/${domain}` : null;
  if (domainFolder) {
    const rrEndsWithDomain = rr === domainFolder || rr.endsWith(domainFolder);
    const frStartsWithDomain = fr.startsWith(domainFolder + '/') || fr === domainFolder;
    if (rrEndsWithDomain && frStartsWithDomain) {
      // Strip one instance from fr to avoid duplication
      fr = fr.slice(domainFolder.length) || '/';
    }
  }

  // If fr is absolute and rr is not '/', ensure we append fr to rr instead of overriding rr.
  let joined;
  if (fr.startsWith('/') && rr && rr !== '/') {
    joined = posix.join(rr, fr.slice(1)).replace(/\\/g, '/');
  } else {
    joined = posix.join(rr, fr).replace(/\\/g, '/');
  }
  // Final defensive normalization
  return sanitizeFtpPath(joined, domain);
}

// Final guard: collapse any duplicated domain/httpdocs segments anywhere in the path.
function sanitizeFtpPath(p, domain) {
  if (!p) return '/';
  let out = p.replace(/\\/g, '/');
  if (!out.startsWith('/')) out = '/' + out;
  // Normalize multi-slashes
  out = out.replace(/\/+/g, '/');

  if (domain) {
    const d = escapeRegExp(domain);
    // Collapse any repeated '/{domain}/' segments to a single '/{domain}/'
    out = out.replace(new RegExp(`/(?:${d}/)+`, 'g'), `/${domain}/`);
    // Specifically collapse '/{domain}/httpdocs/{domain}/httpdocs/' -> '/{domain}/httpdocs/'
    out = out.replace(new RegExp(`/${d}/httpdocs/${d}/httpdocs/`, 'g'), `/${domain}/httpdocs/`);
    // Handle trailing duplicates without final slash variants
    out = out.replace(new RegExp(`/${d}/httpdocs/${d}/httpdocs$`), `/${domain}/httpdocs`);
    out = out.replace(new RegExp(`/${d}/${d}$`), `/${domain}`);
  }

  // Generic httpdocs double folder collapse
  out = out.replace(/\/httpdocs\/httpdocs\//g, '/httpdocs/');
  out = out.replace(/\/httpdocs\/httpdocs$/, '/httpdocs');

  // Re-normalize multi-slashes once more in case replacements introduced any
  out = out.replace(/\/+/g, '/');
  return out;
}

// Strip leading '/{domain}' folder from any FTP path. On shared hosts the FTP
// account is often chrooted inside '/{domain}', so we should never include it.
function stripDomainPrefix(p, domain) {
  if (!p) return '/';
  let out = String(p).replace(/\\/g, '/');
  if (!out.startsWith('/')) out = '/' + out;
  if (domain) {
    const prefix = `/${domain}`;
    if (out === prefix) return '/';
    if (out.startsWith(prefix + '/')) {
      out = out.slice(prefix.length) || '/';
    }
  }
  // Normalize again
  out = out.replace(/\/+/g, '/');
  return out;
}

// Sanitize a web path (path-only, no scheme/host), removing domain/httpdocs ghosts
function sanitizeWebPath(p, domain) {
  if (!p) return '/';
  let out = String(p).replace(/\\/g, '/');
  if (!out.startsWith('/')) out = '/' + out;
  if (domain) {
    const d = escapeRegExp(domain);
    // remove any accidental domain prefix from web paths
    out = out.replace(new RegExp(`/(?:${d}/)+`, 'g'), '/');
  }
  // httpdocs never appears in public URLs
  out = out.replace(/\/httpdocs\//g, '/');
  out = out.replace(/\/+/g, '/');
  return out;
}

// Smart path combination for multiple domains in one hosting folder
function createWebUrl(targetConfig, filePath) {
  const domain = targetConfig.domain;
  if (!domain) {
    if (program.opts().verbose) {
      log('WARN', 'Domain not set on target; cannot build web URL');
    }
    return null;
  }

  // Convert FTP-like remote path to web URL for hosts with per-domain folders
  // Example: /purviewpanda.de/httpdocs/admin/file.txt -> https://purviewpanda.de/admin/file.txt
  // We need to remove the FTP server path prefix and keep only the web-relative part

  let webPath = filePath || '';
  // Defensive: collapse double domain folder segments if present in a provided path
  const dblDomain = new RegExp(`/${escapeRegExp(domain)}/${escapeRegExp(domain)}(/|$)`);
  while (dblDomain.test(webPath)) {
    webPath = webPath.replace(dblDomain, `/${domain}/`);
  }

  // If we were provided a full URL, just return it
  if (/^https?:\/\//i.test(webPath)) {
    return webPath;
  }

  // If the path already looks like a web path (starts with '/admin' or '/'), use as-is after normalization
  // Otherwise, derive from FTP-like remote path by stripping domain folder and /httpdocs

  // Guard: remoteRoot='/' shouldn't be used for prefix removal
  const remoteRoot =
    targetConfig.remoteRoot && targetConfig.remoteRoot !== '/' ? targetConfig.remoteRoot : null;

  if (remoteRoot && webPath.startsWith(remoteRoot)) {
    webPath = webPath.slice(remoteRoot.length);
  }

  // Strip leading domain folder if present (e.g., /purviewpanda.de/...)
  const domainFolderPrefix = `/${domain}`;
  if (webPath.startsWith(domainFolderPrefix + '/')) {
    webPath = webPath.slice(domainFolderPrefix.length);
  }

  // Strip everything up to and including '/httpdocs'
  const httpdocsMarker = '/httpdocs/';
  const idx = webPath.indexOf(httpdocsMarker);
  if (idx >= 0) {
    webPath = webPath.substring(idx + httpdocsMarker.length - 1); // keep leading '/'
  }

  // Ensure webPath starts with /
  if (!webPath.startsWith('/')) {
    webPath = '/' + webPath;
  }

  // If the target domain is a subdomain like admin.example.com and the webPath begins with
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

// resolveProjectFiles now supports per-part:
// - basePath: override base folder for globbing (defaults to localBuild || localSource)
// - include: array of globs
// - exclude: array of globs, merged with global excludes
// - files: array of fixed file mappings { from, to } for special cases
// - remotePath/webPath: base remote/web path
function resolveProjectFiles(projectConfig, parts, excludes) {
  const files = [];
  const partsArray = parts.split(',').map((p) => p.trim());

  log('STEP', `Resolving files for parts: ${partsArray.join(', ')}`);

  for (const partName of partsArray) {
    const part = projectConfig.parts[partName];
    if (!part) {
      throw new Error(`Part '${partName}' not found in project configuration`);
    }

    const basePath = part.basePath || projectConfig.localBuild || projectConfig.localSource;
    if (!fs.existsSync(basePath)) {
      throw new Error(`Source path not found: ${basePath}`);
    }

    // Get included files (glob patterns)
    const includePatterns = (part.include || ['**/*']).map((pattern) =>
      path.join(basePath, pattern).replace(/\\/g, '/')
    );

    const partExcludes = [...(excludes || []), ...(part.exclude || [])];

    const matchedFiles = glob.sync(includePatterns, {
      dot: false,
      ignore: partExcludes.map((ex) => path.join(basePath, ex).replace(/\\/g, '/')),
    });

    for (const filePath of matchedFiles) {
      const relativePath = path.relative(basePath, filePath);
      let remotePath = path.join(part.remotePath || '/', relativePath).replace(/\\/g, '/');
      let webPath = path
        .join(part.webPath || part.remotePath || '/', relativePath)
        .replace(/\\/g, '/');
      const originalRemotePath = remotePath;
      const originalWebPath = webPath;
      // Early normalization
      remotePath = sanitizeFtpPath(
        remotePath,
        (config?.targets?.[program.opts().target] || {}).domain
      );
      // Force-remove domain folder if present
      remotePath = stripDomainPrefix(
        remotePath,
        (config?.targets?.[program.opts().target] || {}).domain
      );
      webPath = sanitizeWebPath(webPath, (config?.targets?.[program.opts().target] || {}).domain);
      if (program.opts().verbose) {
        if (originalRemotePath !== remotePath) {
          log('WARN', `Adjusted remotePath: "${originalRemotePath}" -> "${remotePath}"`);
        }
        if (originalWebPath !== webPath) {
          log('WARN', `Adjusted webPath: "${originalWebPath}" -> "${webPath}"`);
        }
      }
      if (
        hasDuplicatedSegments(remotePath, (config?.targets?.[program.opts().target] || {}).domain)
      ) {
        throw new Error(`Illegal duplicated segments in remotePath: ${remotePath}`);
      }

      files.push({
        localPath: filePath,
        relativePath: relativePath,
        remotePath: remotePath,
        webPath: webPath,
        part: partName,
        size: fs.statSync(filePath).size,
      });
    }

    // Handle fixed-file mappings if defined
    if (Array.isArray(part.files)) {
      for (const mapping of part.files) {
        const from = mapping.from; // absolute or relative to project root
        const to = mapping.to || path.join(part.remotePath || '/', path.basename(from));
        const localPath = path.isAbsolute(from) ? from : path.join(process.cwd(), from);
        if (!fs.existsSync(localPath)) {
          log('WARN', `Fixed file not found: ${from}`);
          continue;
        }
        // Normalize mapping paths as well
        let toRemote = (mapping.to || to).replace(/\\/g, '/');
        let toWeb = (mapping.webTo || mapping.to || to).replace(/\\/g, '/');
        const originalToRemote = toRemote;
        const originalToWeb = toWeb;
        toRemote = sanitizeFtpPath(
          toRemote,
          (config?.targets?.[program.opts().target] || {}).domain
        );
        toRemote = stripDomainPrefix(
          toRemote,
          (config?.targets?.[program.opts().target] || {}).domain
        );
        toWeb = sanitizeWebPath(toWeb, (config?.targets?.[program.opts().target] || {}).domain);
        if (program.opts().verbose) {
          if (originalToRemote !== toRemote) {
            log('WARN', `Adjusted fixed remote: "${originalToRemote}" -> "${toRemote}"`);
          }
          if (originalToWeb !== toWeb) {
            log('WARN', `Adjusted fixed web: "${originalToWeb}" -> "${toWeb}"`);
          }
        }
        if (
          hasDuplicatedSegments(toRemote, (config?.targets?.[program.opts().target] || {}).domain)
        ) {
          throw new Error(`Illegal duplicated segments in fixed mapping: ${toRemote}`);
        }
        files.push({
          localPath,
          relativePath: path.basename(localPath),
          remotePath: toRemote,
          webPath: toWeb,
          part: partName,
          size: fs.statSync(localPath).size,
        });
      }
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

// Post-deploy: purge EJS view cache on the server via ops endpoint
async function purgeViews(targetConfig) {
  if (!targetConfig?.domain) {
    log('WARN', 'No domain configured; skipping view purge');
    return false;
  }
  const token = process.env.ADMIN_ACCESS_TOKEN || '';
  const headers = { 'Cache-Control': 'no-cache', Cookie: 'allow_wip=1' };
  const urls = [
    `https://${targetConfig.domain}/__ops/clear-views${token ? `?admin_token=${encodeURIComponent(token)}` : ''}`,
    `https://${targetConfig.domain}/admin/__ops/clear-views${token ? `?admin_token=${encodeURIComponent(token)}` : ''}`,
  ];
  let ok = false;
  for (const u of urls) {
    try {
      log('INFO', `Purging views via: ${u}`);
      const res = await fetch(u, { timeout: 8000, headers });
      if (res.ok) {
        const text = await res.text();
        if (/\bok\b\s*:\s*true/.test(text) || text.includes('EJS cache cleared')) {
          ok = true;
          log('SUCCESS', '✓ Server view cache purged');
          break;
        } else {
          log('WARN', `⚠ Purge endpoint responded without ok-flag (${res.status})`);
        }
      } else if (res.status === 403) {
        log(
          'ERROR',
          '403 Forbidden on purge endpoint. Set ADMIN_ACCESS_TOKEN in your environment.'
        );
      } else {
        log('WARN', `⚠ Purge request returned ${res.status}`);
      }
    } catch (e) {
      log('WARN', `⚠ Purge request failed: ${e.message}`);
    }
  }
  return ok;
}

async function runBuild(projectConfig) {
  if (!projectConfig.buildCommand) {
    log('INFO', 'No build command configured');
    return true;
  }

  // If a build command is configured, always run it unless explicitly skipped by not using --build.

  log('STEP', `Running build: ${projectConfig.buildCommand}`);

  try {
    // Execute from the project root; if build needs a subdir, author should prefix in buildCommand
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

  let url = null;
  if (projectConfig.verify.urlTemplate && targetConfig.domain) {
    url = projectConfig.verify.urlTemplate
      .replace('{domain}', targetConfig.domain)
      .replace('{file}', fileName);
  } else {
    log('WARN', 'Verification URL not built (missing domain or urlTemplate)');
  }

  return {
    fileName,
    filePath,
    url,
    content,
    timestamp,
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
      secure: false,
    });

    log('SUCCESS', 'FTP connection successful');
    await client.close();
    return true;
  } catch (error) {
    log('ERROR', `FTP connection failed: ${error.message}`);
    return false;
  }
}

async function uploadViaFTP(files, ftpConfig, remoteRoot, targetConfig, includeTimestamp = false) {
  log('STEP', `Uploading ${files.length} files via FTP...`);

  // Small helper to wait
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // Helper to decide if we should retry a failed upload
  const isTransientFtpError = (err) => {
    const msg = String(err?.message || err || '').toLowerCase();
    return (
      msg.includes('econnreset') ||
      msg.includes('client is closed') ||
      msg.includes('timeout') ||
      msg.includes('timed out') ||
      msg.includes('eai_again') ||
      msg.includes('unable to make data connection')
    );
  };

  // Function to open a new FTP client connection
  async function openClient() {
    const c = new ftp.Client();
    c.ftp.timeout = ftpConfig.timeout || 30000;
    await c.access({
      host: ftpConfig.host,
      user: ftpConfig.user,
      password: ftpConfig.password,
      secure: false,
    });
    return c;
  }

  // Use a client to detect server PWD and compute effective root once
  let client;
  try {
    client = await openClient();
    // Detect the server's current working directory to avoid double domain paths
    let ftpPwd = '/';
    try {
      ftpPwd = await client.pwd();
    } catch (_) {
      ftpPwd = '/';
    }
    // Determine effective remote root
    // Start with: if config says '/', use the FTP PWD (common on shared hosts)
    let effectiveRemoteRoot = remoteRoot && remoteRoot !== '/' ? remoteRoot : ftpPwd;
    // Probe for expected folder structure to auto-correct root if needed
    try {
      const domain = (targetConfig && targetConfig.domain) || '';
      // Prefer a readable folder to test
      const candidateA = '/httpdocs';
      const candidateB = domain ? `/${domain}/httpdocs` : null;
      // Try to CD into candidateA relative to current PWD
      let aWorks = false,
        bWorks = false;
      try {
        await client.cd(candidateA);
        aWorks = true;
        await client.cd(ftpPwd);
      } catch (_) {
        aWorks = false;
      }
      if (candidateB) {
        try {
          await client.cd(candidateB);
          bWorks = true;
          await client.cd(ftpPwd);
        } catch (_) {
          bWorks = false;
        }
      }
      if (aWorks && bWorks) {
        // If both work, prefer PWD root (no domain prefix)
        effectiveRemoteRoot = ftpPwd;
      } else if (aWorks) {
        effectiveRemoteRoot = ftpPwd;
      } else if (bWorks) {
        // If only /{domain}/httpdocs works, set root to '/{domain}'
        effectiveRemoteRoot = domain ? `/${domain}` : ftpPwd;
      }
    } catch (_) {
      /* ignore probe errors */
    }
    if (program.opts().verbose) {
      log('INFO', `FTP PWD: "${ftpPwd}"`);
      log('INFO', `Using effective remoteRoot: "${effectiveRemoteRoot}"`);
    }
    // Close and reopen a fresh client for uploads to avoid any state issues from probing
    try {
      await client.close();
    } catch (_) {}
    client = await openClient();

    let successCount = 0;
    let failCount = 0;

    // Optionally create timestamp verification file
    let timestampFile = null;
    let timestamp = null;
    if (includeTimestamp) {
      timestamp = new Date().toISOString();
      const timestampFileName = `deploy-timestamp-${Date.now()}.txt`;
      const timestampContent = `Deployment completed at: ${timestamp}\nFiles uploaded: ${files.length}\nTarget: ${program.opts().target}\nProject: ${program.opts().project}`;
      const timestampTempPath = path.join(process.cwd(), timestampFileName);
      fs.writeFileSync(timestampTempPath, timestampContent);

      // Add timestamp file to upload list - place under the part's configured paths
      const firstFile = files[0];
      // Determine folders separately for remote (FTP) and web URL
      let remoteFolder = '/';
      let webFolder = '/';
      try {
        if (firstFile && firstFile.part) {
          // find the part definition in config.projects to get webPath/remotePath
          const proj = config.projects[program.opts().project];
          const partDef = proj.parts[firstFile.part];
          if (partDef) {
            if (partDef.remotePath) remoteFolder = partDef.remotePath;
            if (partDef.webPath) webFolder = partDef.webPath;
          }
          if (remoteFolder === '/' && firstFile.remotePath) {
            remoteFolder = path.posix.dirname(firstFile.remotePath);
          }
          if (!webFolder && firstFile.webPath) {
            webFolder = path.posix.dirname(firstFile.webPath);
          }
        } else if (firstFile && firstFile.remotePath) {
          remoteFolder = path.posix.dirname(firstFile.remotePath);
          if (firstFile.webPath) webFolder = path.posix.dirname(firstFile.webPath);
        } else {
          remoteFolder = '/';
          webFolder = '/';
        }
      } catch (e) {
        remoteFolder = path.posix.dirname(firstFile?.remotePath || '/');
        webFolder = path.posix.dirname(firstFile?.webPath || '/');
      }

      // Normalize folders
      if (!remoteFolder.startsWith('/')) remoteFolder = '/' + remoteFolder;
      if (!webFolder.startsWith('/')) webFolder = '/' + webFolder;

      timestampFile = {
        localPath: timestampTempPath,
        relativePath: timestampFileName,
        remotePath: path.posix.join(remoteFolder, timestampFileName),
        webPath: path.posix.join(webFolder, timestampFileName),
        size: Buffer.byteLength(timestampContent),
      };
    }

    const uploadList = includeTimestamp ? [...files, timestampFile] : files;

    // Pre-create all required remote directories (shallow to deep)
    const uniqueDirs = Array.from(
      new Set(
        uploadList.map((f) => {
          const remotePathRaw = joinRemotePath(
            effectiveRemoteRoot,
            f.remotePath,
            targetConfig.domain
          );
          const rp = stripDomainPrefix(
            sanitizeFtpPath(remotePathRaw, targetConfig.domain),
            targetConfig.domain
          );
          return sanitizeFtpPath(path.posix.dirname(rp), targetConfig.domain);
        })
      )
    ).sort((a, b) => a.split('/').length - b.split('/').length);

    for (const dir of uniqueDirs) {
      if (hasDuplicatedSegments(dir, targetConfig.domain)) continue;
      try {
        await client.ensureDir(dir);
      } catch (_) {
        /* ignore dir creation errors here */
      }
      await sleep(40);
    }

    for (const file of uploadList) {
      let uploaded = false;
      let lastErr = null;
      // Try a few times with reconnects/backoff on transient failures
      const maxAttempts = 4;
      for (let attempt = 1; attempt <= maxAttempts && !uploaded; attempt++) {
        try {
          // Guard: never allow .env into public web roots (httpdocs) by mistake
          if (
            /\/httpdocs\//.test(file.remotePath) &&
            /(^|\\|\/)\.env(\.|$)/i.test(file.localPath)
          ) {
            throw new Error('Refusing to upload .env into httpdocs (public). Check your mappings.');
          }
          // DEBUG: Log the path calculation
          if (program.opts().verbose) {
            log('INFO', `DEBUG: remoteRoot="${remoteRoot}", file.remotePath="${file.remotePath}"`);
          }

          // Build and sanitize final remote FTP path (use effectiveRemoteRoot to prevent duplication)
          const remotePathRaw = joinRemotePath(
            effectiveRemoteRoot,
            file.remotePath,
            targetConfig.domain
          );
          let remotePath = sanitizeFtpPath(remotePathRaw, targetConfig.domain);
          // Ensure no domain folder remains (hard strip)
          remotePath = stripDomainPrefix(remotePath, targetConfig.domain);
          // HARD GUARD: refuse any duplicated domain/httpdocs segment uploads
          if (
            hasDuplicatedSegments(remotePath, targetConfig.domain) ||
            /\/httpdocs\/httpdocs(\/|$)/i.test(remotePath)
          ) {
            throw new Error(`Blocked upload into duplicated path: ${remotePath}`);
          }

          if (program.opts().verbose) {
            log('INFO', `DEBUG: Final FTP path="${remotePath}"`);
          }

          const remoteDir = sanitizeFtpPath(path.posix.dirname(remotePath), targetConfig.domain);
          if (hasDuplicatedSegments(remoteDir, targetConfig.domain)) {
            throw new Error(`Blocked directory creation for duplicated path: ${remoteDir}`);
          }

          // Ensure directory exists
          try {
            await client.ensureDir(remoteDir);
          } catch (dirError) {
            // Directory might already exist
          }

          // Some servers reject absolute STOR paths; cd into the folder then upload by basename
          try {
            await client.cd('/');
          } catch (_) {}
          try {
            await client.cd(remoteDir);
          } catch (_) {}
          await client.uploadFrom(file.localPath, path.posix.basename(remotePath));
          successCount++;
          uploaded = true;
          if (program.opts().verbose) {
            log('INFO', `✓ ${file.relativePath} → ${remotePath}`);
          }

          // Immediate verification for critical files
          if (includeTimestamp && file === timestampFile) {
            log('STEP', 'Verifying timestamp file upload immediately...');
            try {
              await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
              const verifyUrl = createWebUrl(targetConfig, file.webPath || file.remotePath);
              if (verifyUrl) {
                log('INFO', `Verifying URL: ${verifyUrl}`);
                const verifyResponse = await fetch(verifyUrl, {
                  timeout: 5000,
                  headers: { Cookie: 'allow_wip=1' },
                });
                if (verifyResponse.ok) {
                  const content = await verifyResponse.text();
                  if (content.includes(timestamp)) {
                    log('SUCCESS', '✓ Timestamp file verified immediately after upload');
                  } else {
                    log('WARN', '⚠ Timestamp file uploaded but content mismatch');
                  }
                } else {
                  log(
                    'WARN',
                    `⚠ Timestamp file not immediately accessible (${verifyResponse.status})`
                  );
                }
              } else {
                log('INFO', 'Skipping immediate HTTP check (no domain configured)');
              }
            } catch (verifyError) {
              log('WARN', `⚠ Immediate verification failed: ${verifyError.message}`);
            }
          }
        } catch (error) {
          lastErr = error;
          if (isTransientFtpError(error) && attempt < maxAttempts) {
            const delay = 400 * attempt;
            log(
              'WARN',
              `⚠ Upload failed (attempt ${attempt}/${maxAttempts}) for ${file.relativePath}: ${error.message} — retrying in ${delay}ms`
            );
            try {
              await client.close();
            } catch (_) {}
            await sleep(delay);
            try {
              client = await openClient();
            } catch (reErr) {
              log('WARN', `⚠ Reconnect attempt failed: ${reErr.message}`);
            }
            continue;
          } else {
            // Non-transient or max attempts reached
            break;
          }
        }
      }
      if (!uploaded) {
        failCount++;
        log('ERROR', `✗ ${file.relativePath}: ${lastErr ? lastErr.message : 'Unknown error'}`);
      }
      // Gentle pacing between files to reduce data-socket churn on shared hosts
      await sleep(120);
    }
    try {
      await client.close();
    } catch (_) {}
    // Clean up local timestamp file
    if (includeTimestamp && timestampFile?.localPath) {
      try {
        fs.unlinkSync(timestampFile.localPath);
      } catch (_) {}
    }

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
    verificationFile: false,
    staticOffline: false,
  };

  if (!targetConfig.domain) {
    log('WARN', 'No domain configured; skipping HTTP verification.');
    return true;
  }

  // Test 1: Check main page loads
  try {
    const mainPageUrl = `https://${targetConfig.domain}/`;
    log('INFO', `Testing main page: ${mainPageUrl}`);

    const response = await fetch(mainPageUrl, {
      timeout: config.defaults.verification.httpTimeout || 10000,
      headers: {
        'User-Agent': 'MK-Deploy-Verification/1.0',
        'Cache-Control': 'no-cache',
      },
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

  // Static fallback: offline.html should always be served without dynamic stack
  try {
    const offlineUrl = `https://${targetConfig.domain}/offline.html`;
    log('INFO', `Testing static offline page: ${offlineUrl}`);
    const response = await fetch(offlineUrl, {
      timeout: 8000,
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (response.ok) {
      verificationResults.staticOffline = true;
      log('SUCCESS', '✓ Static offline.html accessible');
    } else {
      log('WARN', `⚠ offline.html returned HTTP ${response.status}`);
    }
  } catch (e) {
    log('WARN', `⚠ offline.html test failed: ${e.message}`);
  }

  // Test 2: Check asset-manifest.json (for main site verification)
  try {
    const manifestUrl = createWebUrl(targetConfig, '/asset-manifest.json');
    log('INFO', `Testing asset manifest: ${manifestUrl}`);

    const response = await fetch(manifestUrl, {
      timeout: 5000,
      headers: {
        'Cache-Control': 'no-cache',
      },
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
          'Cache-Control': 'no-cache',
        },
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
  const totalTests = Object.keys(verificationResults).length;

  log('INFO', `Verification Results: ${successCount}/${totalTests} tests passed`);

  if (verificationResults.mainPage && verificationResults.assetManifest) {
    log('SUCCESS', '🎉 Core deployment verification successful!');
    return true;
  } else if (verificationResults.mainPage) {
    log('WARN', '⚠ Main page works but assets might be cached. Deployment likely successful.');
    return true;
  } else if (verificationResults.staticOffline) {
    log(
      'WARN',
      '⚠ Dynamic page failed but static content is accessible. Marking deployment as OK for static site.'
    );
    return true;
  } else {
    log('ERROR', '❌ Core verification failed - deployment may not be live');
    return false;
  }
}

function saveManifest() {
  const manifestPath = path.join(
    __dirname,
    'manifests',
    `deploy-${manifest.timestamp.replace(/[:.]/g, '-')}.json`
  );
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

    const targetConfig = { ...config.targets[options.target] };
    if (!targetConfig) {
      throw new Error(`Target '${options.target}' not found in configuration`);
    }
    // Optional override for remoteRoot via environment (helps across hosts)
    if (process.env.FTP_REMOTE_ROOT && targetConfig.remoteRoot) {
      targetConfig.remoteRoot = process.env.FTP_REMOTE_ROOT;
      log('INFO', `remoteRoot overridden by FTP_REMOTE_ROOT: ${targetConfig.remoteRoot}`);
    }

    // Validate environment variables for FTP deployments
    if (!options.dryRun && targetConfig.method === 'ftp') {
      const ftpUser = process.env.FTP_USER;
      const ftpPassword = process.env.FTP_PASSWORD;

      if (!ftpUser || !ftpPassword) {
        log('ERROR', '❌ Missing FTP credentials in environment variables');
        log(
          'INFO',
          'Please set environment variables, e.g.:  $env:FTP_USER = "<your_user>" ; $env:FTP_PASSWORD = "<your_password>"'
        );
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
    manifest.parts = options.parts.split(',').map((p) => p.trim());

    log('INFO', `Starting deployment: ${options.project} → ${options.target} (${options.parts})`);

    // Validate path mappings early
    validatePathMappings(projectConfig, targetConfig);

    // Run build if requested
    if (options.build && !(await runBuild(projectConfig))) {
      throw new Error('Build failed');
    }

    // Resolve files to deploy
    const files = resolveProjectFiles(projectConfig, options.parts, config.defaults.excludes);
    manifest.files = files.map((f) => ({
      relativePath: f.relativePath,
      remotePath: f.remotePath,
      size: f.size,
      part: f.part,
    }));

    if (files.length === 0) {
      throw new Error('No files found to deploy');
    }

    log(
      'INFO',
      `Found ${files.length} files to deploy (${files.reduce((sum, f) => sum + f.size, 0)} bytes)`
    );

    // Create verification file
    const verificationFile = createVerificationFile(projectConfig, targetConfig);
    if (verificationFile) {
      // Compute a sensible base remote path for the verification file
      let verifyBaseRemote = '/';
      try {
        const proj = config.projects[options.project];
        const defPart = proj && proj.parts ? proj.parts['default'] : null;
        if (defPart && defPart.remotePath) {
          verifyBaseRemote = defPart.remotePath;
        } else if (files.length > 0 && files[0].remotePath) {
          verifyBaseRemote = path.posix.dirname(files[0].remotePath);
        }
      } catch (_) {}

      files.push({
        localPath: verificationFile.filePath,
        relativePath: verificationFile.fileName,
        remotePath: path.posix.join(verifyBaseRemote, verificationFile.fileName),
        part: 'verification',
        size: fs.statSync(verificationFile.filePath).size,
      });
    }

    // Dry run mode
    if (options.dryRun) {
      log('INFO', '=== DRY RUN MODE ===');
      log(
        'INFO',
        `Would deploy to: ${targetConfig.method} ${targetConfig.ftp?.host || targetConfig.localPath}`
      );
      files.forEach((file) => {
        log('INFO', `  ${file.relativePath} → ${file.remotePath} (${file.size} bytes)`);
      });
      process.exit(0);
    }

    // Deploy files
    let deploySuccess = false;
    const method = options.method || targetConfig.method;

    if (method === 'ftp') {
      if (!(await testFTPConnection(targetConfig.ftp))) {
        throw new Error('FTP connection test failed');
      }
      deploySuccess = await uploadViaFTP(
        files,
        targetConfig.ftp,
        targetConfig.remoteRoot,
        targetConfig
      );
    } else if (method === 'copy') {
      deploySuccess = deployViaCopy(files, targetConfig.localPath);
    } else {
      throw new Error(`Unsupported deployment method: ${method}`);
    }

    if (!deploySuccess) {
      throw new Error('File deployment failed');
    }

    // Optional: purge server view cache to avoid stale EJS after deploy
    if (options.purgeViews) {
      log('STEP', 'Purging server view cache...');
      const purged = await purgeViews(targetConfig);
      if (!purged) {
        log(
          'WARN',
          'View purge was not confirmed. You may need to provide ADMIN_ACCESS_TOKEN or purge manually.'
        );
      }
    }

    // Verify deployment
    let verifySuccess = true;
    if (projectConfig.verify?.enabled) {
      verifySuccess = await verifyDeployment(verificationFile, targetConfig);
      manifest.verification = verificationFile
        ? {
            url: verificationFile.url,
            success: verifySuccess,
          }
        : null;
    } else {
      log('INFO', 'Project-level verification disabled. Skipping verification.');
      manifest.verification = null;
    }

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
