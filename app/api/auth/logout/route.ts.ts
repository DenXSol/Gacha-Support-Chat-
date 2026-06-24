import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });

  response.cookies.set({
    name: 'auth_token',
    value: '',
    httpOnly: true,
    maxAge: 0,
  });

  return response;
}
