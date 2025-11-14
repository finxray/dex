import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory cache to reduce API calls
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 10000; // 10 seconds cache

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

    // Fetch from CoinGecko
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`;
    console.log(`🌐 Fetching from CoinGecko: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      // Add a timeout
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
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
    return NextResponse.json(
      { error: 'Failed to fetch price data', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

