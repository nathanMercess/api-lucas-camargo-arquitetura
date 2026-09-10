import { FastifyInstance } from 'fastify';
import { AdminSessionService } from './admin-session.service.js';
import { CredentialsAuthenticationService } from './credentials-authentication.service.js';
import { LoginAttemptLimiterService } from './login-attempt-limiter.service.js';
import { LoginRequest } from './login-request.model.js';
import { sendProblem } from '../shared/send-problem.js';

export function registerCredentialsRoutes(
  app: FastifyInstance,
  authentication: CredentialsAuthenticationService,
  sessions: AdminSessionService,
): void {
  const attempts = new LoginAttemptLimiterService();

  app.post<{ Body: LoginRequest }>('/api/v1/auth/login', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 1, maxLength: 80 },
          password: { type: 'string', minLength: 1, maxLength: 512 },
        },
      },
    },
  }, async (request, reply) => {
    const { username, password } = request.body;

    if (!attempts.canAttempt(username, request.ip)) {
      request.log.warn({ event: 'authentication.credentials.throttled' }, 'Credential login was throttled.');
      sendProblem(reply, 429, 'Authentication temporarily unavailable', 'Wait before trying to sign in again.');
      return;
    }

    const principal = await authentication.authenticate(username, password);

    if (principal === null) {
      attempts.recordFailure(username, request.ip);
      request.log.warn({ event: 'authentication.credentials.rejected' }, 'Credential login was rejected.');
      sendProblem(reply, 401, 'Authentication failed', 'The username or password is invalid.');
      return;
    }

    attempts.recordSuccess(username, request.ip);
    sessions.create(principal, reply);
    request.log.info({ event: 'authentication.credentials.accepted', actor: principal.email }, 'Credential login succeeded.');
    return reply.header('Cache-Control', 'no-store').code(204).send();
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const actor = request.principal?.email;

    sessions.invalidate(request, reply);
    request.log.info({ event: 'authentication.credentials.logout', ...(actor ? { actor } : {}) }, 'Credential session ended.');
    return reply.header('Cache-Control', 'no-store').code(204).send();
  });
}
