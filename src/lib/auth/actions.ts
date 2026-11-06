'use server';

import { redirect } from 'next/navigation';
import { hashPassword, verifyPassword } from './password';
import { createUser, findUserByEmail } from '../db/queries/users';
import { createSession, destroySession } from './session';

export interface AuthActionResult {
  error?: string;
  success?: boolean;
}

export async function signUp(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get('email')?.toString().trim();
  const password = formData.get('password')?.toString();
  const name = formData.get('name')?.toString().trim();

  if (!email || !password || !name) {
    return { error: 'All fields are required.' };
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' };
  }

  if (!email.includes('@') || !email.includes('.')) {
    return { error: 'Please enter a valid email address.' };
  }

  try {
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return { error: 'An account with this email already exists.' };
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({
      email,
      passwordHash,
      name,
    });

    await createSession(user.id);
  } catch (error) {
    console.error('Sign up error:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to create account.',
    };
  }

  redirect('/dashboard');
}

export async function login(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = formData.get('email')?.toString().trim();
  const password = formData.get('password')?.toString();

  if (!email || !password) {
    return { error: 'Email and password are required.' };
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return { error: 'Invalid email or password.' };
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return { error: 'Invalid email or password.' };
    }

    await createSession(user.id);
  } catch (error) {
    console.error('Login error:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to log in.',
    };
  }

  redirect('/dashboard');
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect('/login');
}
