import { z } from 'zod';
import { NODE_ID_PATTERN } from '../constants/Tracker';

const NodeIdSchema = z.string().regex(NODE_ID_PATTERN, 'node_id must be a 40-character lowercase hex string.');

// HttpsUriSchema mirrors normalizeURI in apps/api/src/auth.ts: absolute https
// URL without userinfo, query, fragment, or path (beyond "/").
const HttpsUriSchema = z
  .string()
  .min(1, 'uri is required.')
  .refine((value: string): boolean => value.startsWith('https://'), 'uri must start with https://.')
  .refine((value: string): boolean => {
    let url: URL;
    try {
      url = new URL(value.trim());
    } catch {
      return false;
    }
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password || url.search || url.hash) return false;
    if (url.pathname && url.pathname !== '/') return false;
    return true;
  }, 'uri must be absolute https without userinfo, query, fragment, or path.');

const base64UrlByteLength = (value: string): number => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(padLen);
  return (b64.length * 3) / 4 - padLen;
};

const base64StdByteLength = (value: string): number => {
  const b64 = value.trim();
  if (b64.length % 4 !== 0) return -1;
  const padLen = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return (b64.length * 3) / 4 - padLen;
};

const Base64Url32Schema = z
  .string()
  .min(1, 'Value is required.')
  .refine((value: string): boolean => base64UrlByteLength(value) === 32, 'Value must decode to 32 bytes.');

const Base64Url64Schema = z
  .string()
  .min(1, 'Value is required.')
  .refine((value: string): boolean => base64UrlByteLength(value) === 64, 'Value must decode to 64 bytes.');

const Base64Std32Schema = z
  .string()
  .min(1, 'Value is required.')
  .refine((value: string): boolean => base64StdByteLength(value) === 32, 'Value must decode to 32 bytes.');

const Base64Std64Schema = z
  .string()
  .min(1, 'Value is required.')
  .refine((value: string): boolean => base64StdByteLength(value) === 64, 'Value must decode to 64 bytes.');

const CertificateSchema = z.object({
  version: z.literal(1, 'Unsupported certificate version.'),
  node_id: NodeIdSchema,
  uri: HttpsUriSchema,
  public_key: Base64Url32Schema,
  issued_at: z.number('issued_at must be a number.'),
  expires_at: z.number('expires_at must be a number.'),
  signature: Base64Url64Schema,
});

const VNodeProofSchema = z.object({
  vnode_id: NodeIdSchema,
  anchor_id: NodeIdSchema,
  index: z.number().int().min(0, 'index must be a non-negative integer.'),
  issued_at: z.number('issued_at must be a number.'),
  expires_at: z.number('expires_at must be a number.'),
  anchor_pub: Base64Std32Schema,
  signature: Base64Std64Schema,
});

const VNodeEntrySchema = z.object({
  vnode_id: NodeIdSchema,
  index: z.number().int().min(0, 'index must be a non-negative integer.'),
  status: z.string().max(64).optional(),
  proof: VNodeProofSchema.optional(),
});

const nonEmptyStringSchema = (fieldName: string, maxLength: number = 2048) =>
  z
    .string()
    .min(1, `${fieldName} is required.`)
    .max(maxLength, `${fieldName} must be ${maxLength} characters or less.`)
    .refine((value: string): boolean => value.trim().length > 0, `${fieldName} is required.`);

const positiveIntegerBodySchema = (fieldName: string) => z.number().int().min(1, `${fieldName} must be at least 1.`);

export {
  Base64Std32Schema,
  Base64Std64Schema,
  Base64Url32Schema,
  Base64Url64Schema,
  CertificateSchema,
  HttpsUriSchema,
  NodeIdSchema,
  VNodeEntrySchema,
  VNodeProofSchema,
  nonEmptyStringSchema,
  positiveIntegerBodySchema,
};
