const { execSync } = require('child_process');

/**
 * Code signing script for Windows builds
 *
 * Required environment variables:
 *   WIN_CSC_LINK     - Path to .pfx certificate file OR base64-encoded certificate
 *   WIN_CSC_KEY_PASSWORD - Certificate password
 *
 * Optional:
 *   SIGNTOOL_PATH    - Custom path to signtool.exe (auto-detected if not set)
 *   TIMESTAMP_SERVER - Custom timestamp server (defaults to DigiCert)
 */
exports.default = async function(configuration) {
  // Check if signing is configured
  if (!process.env.WIN_CSC_LINK || !process.env.WIN_CSC_KEY_PASSWORD) {
    console.log('⚠️  Skipping code signing - WIN_CSC_LINK or WIN_CSC_KEY_PASSWORD not set');
    return;
  }

  const certPath = process.env.WIN_CSC_LINK;
  const certPassword = process.env.WIN_CSC_KEY_PASSWORD;
  const timestampServer = process.env.TIMESTAMP_SERVER || 'http://timestamp.digicert.com';
  const filePath = configuration.path;

  console.log(`🔏 Signing: ${filePath}`);

  try {
    // Use signtool from Windows SDK
    const signCommand = [
      'signtool sign',
      '/f', `"${certPath}"`,
      '/p', `"${certPassword}"`,
      '/tr', timestampServer,
      '/td', 'sha256',
      '/fd', 'sha256',
      '/d', '"SCENSUS Dashboard"',
      `"${filePath}"`
    ].join(' ');

    execSync(signCommand, { stdio: 'inherit' });
    console.log(`✅ Successfully signed: ${filePath}`);
  } catch (error) {
    console.error(`❌ Signing failed: ${error.message}`);
    throw error;
  }
};
