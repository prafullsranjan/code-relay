import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.redirect('https://github.com/pranja33_uhg', { status: 302 });
}
