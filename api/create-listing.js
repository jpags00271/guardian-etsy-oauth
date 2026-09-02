const { kv } = require('@vercel/kv');
const busboy = require('busboy');
const path = require('path');

// Etsy API configuration
const ETSY_API_KEY = '3cztp2vq0gso973raprrvdxr';
const ETSY_API_SECRET = 'fe5gh8rrov';
const ETSY_SHOP_ID = process.env.ETSY_SHOP_ID;
const ETSY_API_BASE = 'https://openapi.etsy.com/v3';

// Upload image to Etsy listing
async function uploadImageToEtsy(accessToken, shopId, listingId, imageBuffer, fileName) {
  const FormData = require('form-data');
  const formData = new FormData();
  formData.append('image', imageBuffer, fileName);

  const response = await fetch(
    `${ETSY_API_BASE}/shops/${shopId}/listings/${listingId}/images`,
    {
      method: 'POST',
      headers: {
        'x-api-key': ETSY_API_KEY,
        'Authorization': `Bearer ${accessToken}`,
        ...formData.getHeaders(),
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy image upload failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.results[0];
}

// Create draft listing in Etsy
async function createEtsyListing(accessToken, shopId, listingData) {
  const payload = {
    title: listingData.title,
    description: listingData.description,
    price: 149, // $1.49 in cents
    quantity: 999,
    tags: Array.isArray(listingData.tags) ? listingData.tags : listingData.tags.split(',').map(t => t.trim()),
    category_id: 686, // Digital Download category
    who_made: 'i_did',
    when_made: 'made_to_order',
    type: 'digital',
    is_personalizable: true,
    personalization_is_required: false,
    state: 'draft', // Draft state - review before publishing
  };

  const response = await fetch(
    `${ETSY_API_BASE}/shops/${shopId}/listings`,
    {
      method: 'POST',
      headers: {
        'x-api-key': ETSY_API_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Etsy listing creation failed: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.results[0];
}

// Parse multipart form data
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers });
    const fields = {};
    const files = [];

    bb.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });

    bb.on('file', (fieldname, file, info) => {
      const chunks = [];
      file.on('data', (data) => {
        chunks.push(data);
      });
      file.on('end', () => {
        files.push({
          fieldname,
          filename: info.filename,
          buffer: Buffer.concat(chunks),
        });
      });
    });

    bb.on('close', () => {
      resolve({ fields, files });
    });

    bb.on('error', reject);
    req.pipe(bb);
  });
}

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!ETSY_SHOP_ID) {
      return res.status(500).json({
        error: 'ETSY_SHOP_ID environment variable not set',
      });
    }

    // Parse multipart form data
    const { fields, files } = await parseMultipart(req);
    const { title, description, tags, price } = fields;

    // Validate required fields
    if (!title || !description || !tags) {
      return res.status(400).json({
        error: 'Missing required fields: title, description, tags',
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        error: 'No image files uploaded',
      });
    }

    // Get access token from Vercel KV
    const accessToken = await kv.get('guardian-creatives:etsy:access_token');
    if (!accessToken) {
      return res.status(401).json({
        error: 'No Etsy access token found. Please run OAuth flow first.',
      });
    }

    // Create the listing first (without images)
    console.log(`Creating Etsy listing: ${title}`);
    const listing = await createEtsyListing(accessToken, ETSY_SHOP_ID, {
      title,
      description,
      tags,
    });

    // Upload images to the listing
    console.log(`Uploading ${files.length} images to listing ${listing.listing_id}`);
    for (let i = 0; i < Math.min(files.length, 10); i++) {
      const file = files[i];
      console.log(`Uploading: ${file.filename}`);

      await uploadImageToEtsy(
        accessToken,
        ETSY_SHOP_ID,
        listing.listing_id,
        file.buffer,
        file.filename
      );
    }

    return res.status(201).json({
      success: true,
      listingId: listing.listing_id,
      title: listing.title,
      status: listing.state,
      url: `https://www.etsy.com/listing/${listing.listing_id}`,
      message: 'Draft listing created successfully. Review in Etsy before publishing.',
    });
  } catch (error) {
    console.error('Error creating listing:', error);
    return res.status(500).json({
      error: 'Failed to create listing',
      details: error.message,
    });
  }
};
