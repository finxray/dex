import { NextRequest, NextResponse } from 'next/server';

// Cache for market chart data (historical data changes less frequently)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 300000; // 5 minutes cache for historical data

// Rate limiting: track last request time
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // Minimum 2 seconds between requests

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const coinId = searchParams.get('id');
    const days = searchParams.get('days') || '7';
    const vsCurrency = searchParams.get('vs_currency') || 'usd';
    
    if (!coinId) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = `${coinId}-${days}-${vsCurrency}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`✅ Cache hit for market chart: ${cacheKey}`);
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
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=${vsCurrency}&days=${days}`;
    console.log(`🌐 Fetching market chart from CoinGecko: ${url}`);
    
    lastRequestTime = Date.now();
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000), // 15 second timeout for historical data
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      
      // Handle rate limit errors - return cached data if available
      if (response.status === 429) {
        console.error(`⚠️ Rate limit exceeded (429) for market chart.`);
        if (cached) {
          console.log(`📦 Returning stale cache due to rate limit`);
          return NextResponse.json(cached.data);
        }
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
    
    // Clean up old cache entries
    if (cache.size > 50) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('❌ Error in CoinGecko market chart proxy:', error);
    
    // Try to return cached data on error
    const searchParams = request.nextUrl.searchParams;
    const coinId = searchParams.get('id');
    const days = searchParams.get('days') || '7';
    const vsCurrency = searchParams.get('vs_currency') || 'usd';
    if (coinId) {
      const cacheKey = `${coinId}-${days}-${vsCurrency}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        console.log(`📦 Returning cached data due to error`);
        return NextResponse.json(cached.data);
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch market chart data', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

