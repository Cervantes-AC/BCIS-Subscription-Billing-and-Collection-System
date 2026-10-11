/**
 * Multipart plugin for file uploads
 */

import { FastifyPluginAsync } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { config } from '../config';

const multipartPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: config.maxFileSize,
      files: 1,
    },
    attachFieldsToBody: true,
  });

  fastify.log.info('Multipart plugin registered');
};

export default multipartPlugin;