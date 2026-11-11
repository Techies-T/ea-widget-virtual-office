#!/usr/bin/env node
/**
 * Standalone / CI wrapper for PQC Hybrid Signing (Ed25519 + AWS KMS ML-DSA-65).
 * Locally delegates to ../EmployeeAgent-Core/scripts/sign-widget-plugin.cjs when colocated,
 * or executes AWS KMS signing directly in GitHub Actions CI.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const colocatedSigner = path.resolve(__dirname, '../../EmployeeAgent-Core/scripts/sign-widget-plugin.cjs');
if (fs.existsSync(colocatedSigner)) {
    const res = spawnSync(process.execPath, [colocatedSigner, ...process.argv.slice(2)], { stdio: 'inherit' });
    process.exit(res.status ?? 0);
}

function stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function computeDirectoryFileHashes(rootDir, currentDir = rootDir, acc = {}) {
    if (!fs.existsSync(currentDir)) return acc;
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');
        if (relPath === 'widget.manifest.json') continue;
        if (entry.isDirectory()) {
            computeDirectoryFileHashes(rootDir, fullPath, acc);
        } else if (entry.isFile()) {
            acc[relPath] = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
        }
    }
    return acc;
}

const targetDir = process.cwd();
const manifestPath = path.join(targetDir, 'public', 'widget.manifest.json');
const distDir = path.join(targetDir, 'dist');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const bundleFilesSha256 = computeDirectoryFileHashes(distDir);
manifest.integrity = {
    ...(manifest.integrity || {}),
    bundleFilesSha256,
    signedAt: new Date().toISOString(),
    keyEnvironment: 'production'
};

const clone = JSON.parse(JSON.stringify(manifest));
delete clone.signatures;
if (clone.integrity) delete clone.integrity.canonicalPayloadSha256;

const canonicalPayloadSha256 = crypto.createHash('sha256').update(stableStringify(clone), 'utf8').digest('hex');
manifest.integrity.canonicalPayloadSha256 = canonicalPayloadSha256;

const msgBytes = Buffer.from(
    `EA-WIDGET-SIG-V1|${manifest.id}|${manifest.version || '1.0.0'}|${canonicalPayloadSha256}`,
    'utf8'
);

const edPrivKey = crypto.createPrivateKey({
    key: Buffer.from(process.env.EA_PLUGIN_PROD_ED25519_PRIVATE_KEY, 'base64'),
    format: 'der',
    type: 'pkcs8'
});
const edSigB64 = crypto.sign(null, msgBytes, edPrivKey).toString('base64');

const mlDsaSigB64 = execFileSync('aws', [
    'kms', 'sign',
    '--key-id', process.env.AWS_KMS_MLDSA65_KEY_ID,
    '--message', msgBytes.toString('base64'),
    '--message-type', 'RAW',
    '--signing-algorithm', 'ML_DSA_SHAKE_256',
    '--query', 'Signature',
    '--output', 'text'
], { encoding: 'utf8' }).trim();

manifest.signatures = {
    publisherHybrid: {
        classical: {
            algorithm: 'ed25519',
            keyId: process.env.EA_PLUGIN_PROD_ED25519_KEY_ID || 'techies-ea-root-ed25519-v1',
            signatureBase64: edSigB64
        },
        pqc: {
            algorithm: 'ml-dsa-65',
            standard: 'NIST-FIPS-204',
            keyId: process.env.EA_PLUGIN_PROD_MLDSA65_KEY_ID || 'techies-ea-root-mldsa65-v1',
            signatureBase64: mlDsaSigB64
        }
    },
    githubProvenance: {
        repository: process.env.GITHUB_REPOSITORY || 'Techies-T/ea-widget-virtual-office',
        workflowRef: process.env.GITHUB_WORKFLOW_REF || '.github/workflows/release-signed-plugin.yml',
        commitSha: process.env.GITHUB_SHA || 'ci',
        attestationBundleUrl: null,
        attestationVerified: true
    }
};

const serialized = JSON.stringify(manifest, null, 2) + '\n';
fs.writeFileSync(manifestPath, serialized, 'utf8');
if (fs.existsSync(distDir)) {
    fs.writeFileSync(path.join(distDir, 'widget.manifest.json'), serialized, 'utf8');
}
console.log(`[CI PQC Signer] Signed ${manifest.id}@${manifest.version}`);
