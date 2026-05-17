import type { Classification } from '@/db/schema/enums';
import { CLASSIFICATION_RANK } from '@/db/schema/enums';

export const CLOUD_PROVIDERS = ['none', 'aws', 'azure', 'gcp', 'other'] as const;
export type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

export const ASSESSMENT_TYPES = ['standard', 'cloud_irap'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

const PROVIDER_RESPONSIBILITY_TERMS = [
  'physical',
  'facility',
  'facilities',
  'data centre',
  'datacentre',
  'data center',
  'datacenter',
  'environmental',
  'perimeter',
  'cabling',
  'cable',
  'server room',
  'building',
  'visitor',
  'power',
  'hvac',
  'rack',
  'hardware disposal',
  'media disposal',
  'storage media sanitisation',
  'storage media sanitization',
  'protective security',
  'secure area',
];

export function canUseProtectedCloudInheritance(
  assessmentType: AssessmentType,
  cloudProvider: CloudProvider,
  classification: Classification,
) {
  return (
    assessmentType === 'cloud_irap' &&
    ['aws', 'azure', 'gcp'].includes(cloudProvider) &&
    CLASSIFICATION_RANK[classification] <= CLASSIFICATION_RANK.PROTECTED
  );
}

export function isCloudProviderInheritedControl(control: {
  topic: string | null;
  section: string | null;
  description: string;
}) {
  const haystack = [control.topic ?? '', control.section ?? '', control.description]
    .join(' ')
    .toLowerCase();
  return PROVIDER_RESPONSIBILITY_TERMS.some((term) => haystack.includes(term));
}

export function cloudProviderLabel(provider: CloudProvider) {
  switch (provider) {
    case 'aws':
      return 'AWS';
    case 'azure':
      return 'Azure';
    case 'gcp':
      return 'Google Cloud';
    case 'other':
      return 'Other cloud provider';
    default:
      return 'None';
  }
}
