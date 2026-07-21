import { OAuth2Client } from 'google-auth-library';
import { FastifyInstance } from 'fastify';
import { AppConfig } from '../config/app-config.model.js';
import { sendProblem } from '../shared/send-problem.js';
import { AuthMode } from './auth-mode.enum.js';
import { IapPublicKeyProvider } from './iap-public-key-provider.js';

const iapIssuer = 'https://cloud.google.com/iap';

export function registerAuthentication(app: FastifyInstance, config: AppConfig): void {
  const oAuth2Client = new OAuth2Client();
  const publicKeyProvider = new IapPublicKeyProvider(oAuth2Client);

  app.decorateRequest('principal', null);
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/healthz')
      return;

    if (config.authMode === AuthMode.Development) {
      request.principal = {
        subject: `development:${config.developmentPrincipalEmail}`,
        email: config.developmentPrincipalEmail,
      };
      return;
    }

    const assertion = request.headers['x-goog-iap-jwt-assertion'];

    if (typeof assertion !== 'string' || assertion.trim() === '') {
      sendProblem(reply, 401, 'Authentication required', 'The IAP assertion is missing.');
      return;
    }

    if (config.iapExpectedAudience === undefined)
      throw new Error('IAP expected audience is not configured.');

    try {
      let keys = await publicKeyProvider.getKeys();
      let ticket: Awaited<ReturnType<OAuth2Client['verifySignedJwtWithCertsAsync']>>;

      try {
        ticket = await oAuth2Client.verifySignedJwtWithCertsAsync(
          assertion,
          keys,
          config.iapExpectedAudience,
          [iapIssuer],
        );
      } catch {
        keys = await publicKeyProvider.getKeys(true);
        ticket = await oAuth2Client.verifySignedJwtWithCertsAsync(
          assertion,
          keys,
          config.iapExpectedAudience,
          [iapIssuer],
        );
      }
      const payload = ticket.getPayload();

      if (payload?.sub === undefined || payload.email === undefined) {
        sendProblem(reply, 401, 'Authentication required', 'The IAP identity is incomplete.');
        return;
      }

      request.principal = {
        subject: payload.sub,
        email: payload.email.toLowerCase(),
      };
    } catch {
      request.log.warn({ event: 'authentication.iap.rejected' }, 'IAP assertion validation failed.');
      sendProblem(reply, 401, 'Authentication required', 'The IAP assertion is invalid.');
    }
  });
}
