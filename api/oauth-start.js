/**
 * OAuth Start - Generate Authorization URL with PKCE
 * Endpoint: /api/oauth-start
 *
 * Generates the OAuth authorization URL with PKCE
 * Verifier is encoded in the state parameter for retrieval in callback
 */

const crypto = require('crypto');

module.exports = function handler(req, res) {
  try {
    const apiKey = process.env.ETSY_CLIENT_ID || '3cztp2vq0gso973raprrvdxr';
    const redirectUri = 'https://guardian-etsy-oauth-sigma.vercel.app/api/oauth-callback';
    const scopes = 'email_r';

    // Generate PKCE parameters
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    // Encode verifier in state as base64 so it survives the redirect
    const state = Buffer.from(codeVerifier).toString('base64url');

    // Generate authorization URL
    const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&client_id=${apiKey}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&code_challenge=${codeChallenge}&code_challenge_method=S256&state=${state}`;

    return res.status(200).json({
      success: true,
      authUrl: authUrl,
      message: 'Authorization URL generated. Click the URL to start OAuth flow.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[OAuth Start] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
