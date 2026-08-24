import { siteConfigV1Schema } from './site-config-v1.schema.js';
import { siteConfigV2Schema } from './site-config-v2.schema.js';

export const siteDocumentSchema = {
  oneOf: [
    {
      allOf: [
        {
          not: {
            anyOf: [
              { type: 'object', required: ['contact'] },
              { type: 'object', required: ['pages'] },
            ],
          },
        },
        siteConfigV1Schema,
      ],
    },
    {
      allOf: [
        {
          not: {
            anyOf: [
              { type: 'object', required: ['sections'] },
              { type: 'object', required: ['visualBuilder'] },
            ],
          },
        },
        siteConfigV2Schema,
      ],
    },
  ],
} as const;
