import { cookies } from 'next/headers';

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) return false;

  return !!token;
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('auth_token');
}
