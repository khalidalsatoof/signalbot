export const metadata = { title: 'SignalBot', description: 'NASDAQ Trading Signals' }
export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{margin:0,padding:0,background:'#050810'}}>{children}</body>
    </html>
  )
}
