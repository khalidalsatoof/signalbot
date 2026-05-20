import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')
  if (!symbol) return NextResponse.json({ error: 'no symbol' }, { status: 400 })

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      next: { revalidate: 900 }
    })
    if (!res.ok) throw new Error(`YF ${res.status}`)
    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) throw new Error('no result')
    const q = result.indicators.quote[0]
    const candles = []
    for (let i = 0; i < q.close.length; i++) {
      if (q.close[i] && q.high[i] && q.low[i]) {
        candles.push({ c: q.close[i], h: q.high[i], l: q.low[i], o: q.open[i] || q.close[i] })
      }
    }
    return NextResponse.json({ symbol, candles })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
