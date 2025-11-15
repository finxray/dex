import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory cache to reduce API calls
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 60 seconds cache (increased from 10s to prevent rate limits)

// Rate limiting: track last request time and enforce minimum delay
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // Minimum 2 seconds between requests (30 requests/minute max)

// Request queue to prevent concurrent requests
let isRequestInProgress = false;
const requestQueue: Array<() => void> = [];

async function processRequestQueue() {
  if (isRequestInProgress || requestQueue.length === 0) {
    return;
  }

  isRequestInProgress = true;
  const nextRequest = requestQueue.shift();
  if (nextRequest) {
    nextRequest();
  }
  isRequestInProgress = false;

  // Process next request in queue
  if (requestQueue.length > 0) {
    setTimeout(processRequestQueue, MIN_REQUEST_INTERVAL);
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const coinIds = searchParams.get('ids');
    
    if (!coinIds) {
      return NextResponse.json(
        { error: 'Missing required parameter: ids' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = coinIds;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`✅ Cache hit for ${coinIds}`);
      return NextResponse.json(cached.data);
    }

    // Rate limiting: ensure minimum time between requests
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: waiting ${waitTime}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Fetch from CoinGecko
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`;
    console.log(`🌐 Fetching from CoinGecko: ${url}`);
    
    lastRequestTime = Date.now();
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      // Add a timeout
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      
      // Handle rate limit errors specifically
      if (response.status === 429) {
        console.error(`⚠️ Rate limit exceeded (429). Increasing cache TTL and backing off.`);
        // Return cached data if available, even if expired
        if (cached) {
          console.log(`📦 Returning stale cache due to rate limit`);
          return NextResponse.json(cached.data);
        }
        // If no cache, return error but don't retry immediately
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again in a moment.', details: errorText },
          { status: 429 }
        );
      }
      
      console.error(`❌ CoinGecko API error: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `CoinGecko API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Cache the result
    cache.set(cacheKey, { data, timestamp: Date.now() });
    
    // Clean up old cache entries (keep only last 100 entries)
    if (cache.size > 100) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('❌ Error in CoinGecko proxy:', error);
    
    // If request was aborted or timed out, try to return cached data
    const searchParams = request.nextUrl.searchParams;
    const coinIds = searchParams.get('ids');
    if (coinIds) {
      const cached = cache.get(coinIds);
      if (cached) {
        console.log(`📦 Returning cached data due to error`);
        return NextResponse.json(cached.data);
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch price data', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

