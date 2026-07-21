import { IapPrincipal } from './iap-principal.model.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: IapPrincipal | null;
  }
}
