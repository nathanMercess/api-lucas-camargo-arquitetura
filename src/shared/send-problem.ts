import { FastifyReply } from 'fastify';
import { ProblemDetails } from './problem-details.model.js';

export function sendProblem(reply: FastifyReply, status: number, title: string, detail: string): FastifyReply {
  const problem: ProblemDetails = {
    type: 'about:blank',
    title,
    status,
    detail,
  };

  return reply.code(status).type('application/problem+json').send(problem);
}
