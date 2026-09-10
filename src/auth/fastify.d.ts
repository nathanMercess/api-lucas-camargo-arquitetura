import { AdminPrincipal } from './admin-principal.model.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: AdminPrincipal | null;
  }
}
