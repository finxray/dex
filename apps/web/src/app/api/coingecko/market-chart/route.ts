import { NextRequest, NextResponse } from 'next/server';

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

    // Fetch from CoinGecko
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=${vsCurrency}&days=${days}`;
    console.log(`🌐 Fetching market chart from CoinGecko: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000), // 15 second timeout for historical data
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
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('❌ Error in CoinGecko market chart proxy:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market chart data', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

