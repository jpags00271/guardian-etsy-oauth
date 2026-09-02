/**
 * Etsy OAuth Callback Handler with PKCE
 * Guardian Custom Creations
 * Endpoint: /api/oauth-callback
 *
 * Receives authorization code from Etsy OAuth redirect
 * Decodes verifier from state parameter and exchanges code for access token
 */

import https from 'https';
import { URLSearchParams } from 'url';

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  console.log('[OAuth Callback] Received:', {
    hasCode: !!code,
    hasState: !!state,
    error,
  });

  // Handle OAuth errors
  if (error) {
    console.error('[OAuth Callback] Error:', error, error_description);
    return res.status(400).json({
      error: error,
      error_description: error_description || 'OAuth authorization failed',
    });
  }

  // Validate required parameters
  if (!code || !state) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing authorization code or state parameter',
    });
  }

  try {
    // Decode verifier from state parameter
    const codeVerifier = Buffer.from(state, 'base64url').toString('utf-8');

    console.log('[OAuth Callback] Decoded verifier:', {
      verifierLength: codeVerifier.length,
      verifierStartsWith: codeVerifier.substring(0, 10) + '...',
    });

    // Prepare token exchange request
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ETSY_CLIENT_ID,
      client_secret: process.env.ETSY_CLIENT_SECRET,
      redirect_uri: process.env.ETSY_REDIRECT_URI,
      code: code,
      code_verifier: codeVerifier,
    });

    const postData = params.toString();

    // Make HTTPS request to Etsy token endpoint
    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.etsy.com',
        port: 443,
        path: '/v3/public/oauth/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: data,
          });
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.write(postData);
      req.end();
    });

    const responseData = JSON.parse(response.body);

    console.log('[OAuth Callback] Token exchange response:', {
      statusCode: response.statusCode,
      hasAccessToken: !!responseData.access_token,
      hasRefreshToken: !!responseData.refresh_token,
    });

    if (response.statusCode !== 200) {
      console.error('[OAuth Callback] Token exchange failed:', responseData);
      return res.status(response.statusCode).json(responseData);
    }

    // Success: return tokens
    return res.status(200).json({
      access_token: responseData.access_token,
      refresh_token: responseData.refresh_token,
      expiresIn: responseData.expires_in,
      tokenType: responseData.token_type,
    });
  } catch (err) {
    console.error('[OAuth Callback] Unexpected error:', err);
    return res.status(500).json({
      error: 'server_error',
      error_description: err.message,
    });
  }
}
