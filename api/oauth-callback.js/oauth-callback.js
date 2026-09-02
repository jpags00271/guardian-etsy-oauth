/**
 * Etsy OAuth Callback Handler with PKCE
 * Guardian Custom Creations
 * Endpoint: /api/oauth-callback
 *
 * Receives authorization code from Etsy OAuth redirect
 * Decodes verifier from state parameter and exchanges code for access token
 */

import axios from 'axios';

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;

  console.log('[OAuth Callback] Received:', {
    hasCode: !!code,
    state,
    error
  });

  // Handle errors from Etsy OAuth
  if (error) {
    return res.status(400).json({
      success: false,
      error: error,
      error_description: error_description || 'Unknown error from Etsy',
      timestamp: new Date().toISOString()
    });
  }

  // Success - authorization code received
  if (code && state) {
    try {
      // Decode the verifier from the state parameter
      const codeVerifier = Buffer.from(state, 'base64url').toString('utf-8');

      // Exchange code for token
      const response = await axios.post(
        'https://api.etsy.com/v3/public/oauth/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: process.env.ETSY_CLIENT_ID || '3cztp2vq0gso973raprrvdxr',
          client_secret: process.env.ETSY_CLIENT_SECRET || 'fe5gh8rrov',
          code: code,
          redirect_uri: 'https://guardian-etsy-oauth-sigma.vercel.app/api/oauth-callback',
          code_verifier: codeVerifier
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      const accessToken = response.data.access_token;
      const refreshToken = response.data.refresh_token;
      const expiresIn = response.data.expires_in;

      return res.status(200).json({
        success: true,
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresIn: expiresIn,
        message: 'Access token obtained successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[OAuth Callback] Token exchange failed:', error.response?.data || error.message);

      return res.status(400).json({
        success: false,
        error: 'Token exchange failed',
        details: error.response?.data || error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // No code and no error - invalid request
  return res.status(400).json({
    success: false,
    error: 'No authorization code received',
    message: 'This endpoint expects ?code=<authorization_code> from Etsy OAuth redirect'
  });
}
