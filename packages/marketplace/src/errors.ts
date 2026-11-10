export type MarketplaceErrorCode =
  | 'invalid_manifest'
  | 'forbidden_field'
  | 'undeclared_permission'
  | 'digest_mismatch'
  | 'file_hash_mismatch'
  | 'unsafe_path'
  | 'symlink_rejected'
  | 'executable_payload'
  | 'undeclared_file'
  | 'missing_file'
  | 'unknown_registry'
  | 'registry_mismatch'
  | 'package_not_found'
  | 'incompatible'
  | 'policy_denied'
  | 'approved_flag_rejected'
  | 'invalid_request'
  | 'invalid_transition'
  | 'not_installed'
  | 'self_approval'
  | 'approval_unavailable'
  | 'invalid_state_file';

export class MarketplaceError extends Error {
  readonly code: MarketplaceErrorCode;
  readonly details: unknown;
  constructor(code: MarketplaceErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'MarketplaceError';
    this.code = code;
    this.details = details;
  }
}
