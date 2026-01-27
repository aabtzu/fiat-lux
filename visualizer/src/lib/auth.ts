import bcrypt from 'bcrypt';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { getDb } from './db';

const SALT_ROUNDS = 10;
const SESSION_DURATION_DAYS = 7;
const COOKIE_NAME = 'session';

// Get JWT secret - in production this should be set via environment variable
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production-min-32-chars';
  return new TextEncoder().encode(secret);
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  created_at: string;
}

interface DbSession {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// User operations
export async function createUser(email: string, password: string, displayName?: string): Promise<User> {
  const db = getDb();
  const id = generateId();
  const passwordHash = await hashPassword(password);

  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, display_name)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(id, email.toLowerCase(), passwordHash, displayName || null);

  return {
    id,
    email: email.toLowerCase(),
    displayName: displayName || null,
    createdAt: new Date().toISOString(),
  };
}

export function getUserByEmail(email: string): DbUser | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email.toLowerCase()) as DbUser | null;
}

export function getUserById(id: string): User | null {
  const db = getDb();
  const stmt = db.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?');
  const row = stmt.get(id) as DbUser | null;

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

// Session operations
export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const sessionId = generateId();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  // Create session in database
  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `);
  stmt.run(sessionId, userId, expiresAt.toISOString());

  // Create JWT token
  const token = await new SignJWT({ sessionId, userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresAt)
    .sign(getJwtSecret());

  return token;
}

export async function validateSession(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const sessionId = payload.sessionId as string;
    const userId = payload.userId as string;

    const db = getDb();

    // Check session exists and is not expired
    const sessionStmt = db.prepare(`
      SELECT * FROM sessions
      WHERE id = ? AND user_id = ? AND expires_at > datetime('now')
    `);
    const session = sessionStmt.get(sessionId, userId) as DbSession | null;

    if (!session) return null;

    // Get user
    return getUserById(userId);
  } catch {
    return null;
  }
}

export async function destroySession(token: string): Promise<void> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const sessionId = payload.sessionId as string;

    const db = getDb();
    const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(sessionId);
  } catch {
    // Token invalid, nothing to destroy
  }
}

// Clean up expired sessions (call periodically)
export function cleanupExpiredSessions(): void {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')");
  stmt.run();
}

// Get current user from cookies (for server components)
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  return validateSession(token);
}

// Set session cookie
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

// Clear session cookie
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Login function
export async function login(email: string, password: string): Promise<{ user: User; token: string } | null> {
  const dbUser = getUserByEmail(email);
  if (!dbUser) return null;

  const valid = await verifyPassword(password, dbUser.password_hash);
  if (!valid) return null;

  const token = await createSession(dbUser.id);

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      displayName: dbUser.display_name,
      createdAt: dbUser.created_at,
    },
    token,
  };
}

// Register function
export async function register(email: string, password: string, displayName?: string): Promise<{ user: User; token: string } | null> {
  // Check if user already exists
  const existing = getUserByEmail(email);
  if (existing) return null;

  const user = await createUser(email, password, displayName);
  const token = await createSession(user.id);

  return { user, token };
}
