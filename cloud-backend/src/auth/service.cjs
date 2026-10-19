const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('node:crypto');
const dummyHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function publicUser(user) {
  return {
    id: user.id, email: user.email, name: user.name, role: user.role,
    isActive: Boolean(user.isActive), mustChangePassword: Boolean(user.mustChangePassword),
    employeeId: user.identity?.employeeId ?? null,
    organizationalRank: user.identity?.organizationalRank ?? null,
    isOwner: Boolean(user.identity?.isOwner), isExecutive: Boolean(user.identity?.isExecutive),
    isManager: Boolean(user.identity?.isManager), permissions: user.permissions || [],
  };
}
function createAuthService(repository, secret) {
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  async function authenticate(authorization) {
    if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required');
    let payload;
    try { payload = jwt.verify(authorization.slice(7), secret, { algorithms: ['HS256'] }); }
    catch { throw new HttpError(401, 'Invalid or expired token'); }
    if (typeof payload !== 'object' || typeof payload.userId !== 'string') throw new HttpError(401, 'Invalid token');
    const user = await repository.byId(payload.userId);
    if (!user?.isActive) throw new HttpError(401, 'Account not found or inactive');
    return user;
  }
  return {
    authenticate,
    async login(body) {
      const { email, password } = body || {};
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 254 || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) {
        throw new HttpError(400, 'Invalid input');
      }
      const user = await repository.byEmail(email.trim().toLowerCase());
      const valid = await bcrypt.compare(password, user?.password || dummyHash);
      if (!user?.isActive || !valid) throw new HttpError(401, 'Invalid credentials or inactive account');
      const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, secret,
        { algorithm: 'HS256', expiresIn: '7d' });
      return { success: true, token, user: publicUser(user) };
    },
    async me(authorization) { return { success: true, user: publicUser(await authenticate(authorization)) }; },
    async changePassword(authorization, body) {
      const user = await authenticate(authorization);
      const { currentPassword, newPassword } = body || {};
      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' ||
          newPassword.length < 12 || Buffer.byteLength(newPassword) > 72) {
        throw new HttpError(400, 'Use a new password between 12 characters and 72 bytes');
      }
      if (!await bcrypt.compare(currentPassword, user.password)) throw new HttpError(400, 'Current password is incorrect');
      try { await repository.changePassword(user.id, user.password, await bcrypt.hash(newPassword, 12)); }
      catch (error) {
        if (error.name === 'ConditionalCheckFailedException') throw new HttpError(409, 'Account changed; sign in again');
        throw error;
      }
      return { success: true };
    },
  };
}
module.exports = { createAuthService, HttpError };
