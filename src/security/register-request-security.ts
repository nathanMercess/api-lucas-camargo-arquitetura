import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config/app-config.model.js';
import { sendProblem } from '../shared/send-problem.js';

const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function registerRequestSecurity(app: FastifyInstance, config: AppConfig): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!mutatingMethods.has(request.method))
      return;

    const origin = request.headers.origin?.trim();

    if (origin === undefined || !config.adminAllowedOrigins.includes(origin)) {
      sendProblem(reply, 403, 'Origin rejected', 'This write request did not originate from an approved admin address.');
      return reply;
    }

    if (origin !== getRequestOrigin(request.protocol, request.host)) {
      sendProblem(reply, 403, 'Cross-origin write rejected', 'Admin write requests must use the same origin as the API.');
      return reply;
    }

    if (request.headers['sec-fetch-site'] !== undefined && request.headers['sec-fetch-site'] !== 'same-origin') {
      sendProblem(reply, 403, 'Cross-site request rejected', 'The browser identified this as a cross-site write request.');
      return reply;
    }

    if (request.headers['x-admin-csrf'] !== '1') {
      sendProblem(reply, 403, 'CSRF validation failed', 'Send the required X-Admin-CSRF header from the admin application.');
      return reply;
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('Content-Security-Policy', buildContentSecurityPolicy(config));
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');

    if (request.url.startsWith('/api/'))
      reply.header('Cache-Control', 'no-store');

    if (config.environment === 'production')
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    return payload;
  });
}

function getRequestOrigin(protocol: string, host: string): string {
  return new URL(`${protocol}://${host}`).origin;
}

function buildContentSecurityPolicy(config: AppConfig): string {
  const connectOrigins = new Set<string>(["'self'", 'https://*.r2.cloudflarestorage.com']);

  if (config.r2 !== undefined)
    connectOrigins.add(new URL(config.r2.endpoint).origin);

  if (config.publishedBaseUrl !== undefined)
    connectOrigins.add(new URL(config.publishedBaseUrl).origin);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${[...connectOrigins].join(' ')}`,
    "worker-src 'self' blob:",
    ...(config.environment === 'production' ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
