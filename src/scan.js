// src/scan.js — malware-scanning hook. Real scanner (ClamAV/VirusTotal/S3 AV) plugs in here.
// Until configured, it does lightweight sanity checks and returns clean. Never logs file bytes.
const ENABLED = !!process.env.MALWARE_SCAN_URL;

async function scanFile(buffer, meta = {}) {
  // Interface: return { clean: boolean, reason?: string, engine: string }
  if (!buffer || !buffer.length) return { clean: false, reason: "empty file", engine: "builtin" };
  if (ENABLED) {
    // TODO: POST buffer to MALWARE_SCAN_URL and parse verdict.
    return { clean: true, engine: "external" };
  }
  return { clean: true, engine: "noop" };
}
module.exports = { scanFile, enabled: () => ENABLED };
