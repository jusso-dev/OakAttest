// Tenant branding (§12). Defaults applied when a tenant has not customised.
// Per-tenant overrides live on `tenants.branding` JSONB and are resolved by
// `resolveBranding(tenant)`.

export const DEFAULT_BRANDING = {
  productName: 'OakAttest',
  primaryColour: '#0f4c4a', // muted teal
  accentColour: '#243a52',  // navy
  logoUrl: null as string | null,
} as const;

export type Branding = {
  productName: string;
  primaryColour: string;
  accentColour: string;
  logoUrl: string | null;
};

export function resolveBranding(input?: Partial<Branding> | null): Branding {
  return {
    productName: input?.productName ?? DEFAULT_BRANDING.productName,
    primaryColour: input?.primaryColour ?? DEFAULT_BRANDING.primaryColour,
    accentColour: input?.accentColour ?? DEFAULT_BRANDING.accentColour,
    logoUrl: input?.logoUrl ?? DEFAULT_BRANDING.logoUrl,
  };
}
