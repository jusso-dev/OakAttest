# Operational GRC

`/engagements/[id]/governance` covers recurring client-side control operation between assessments.

## Policy lifecycle

Policies move through `draft`, `in_review`, `approved`, `published`, and `retired`. Published versions create
one attestation for every active client engagement member. Each person can accept only their own assignment.
Accepted records retain policy version, timestamp, and a SHA-256 acceptance receipt. Revisions create a new
draft version without changing the published record.

## Personnel assurance

Personnel records track onboarding, active, suspended, and terminated states, screening status/expiry,
training due/completion dates, and termination offboarding. Activation requires verified screening or a
documented `not_required` decision. Termination requires an offboarding due date.

## Access reviews

Campaigns contain named access records and move from draft to in progress, review, and completion. Every
record requires a retain, modify, or revoke decision. Modify/revoke decisions require rationale and remediation;
the campaign cannot complete while any decision or remediation remains open.

## Vendor risk

Vendor records retain criticality, data handled, due-diligence summary, inherent and residual risk, contract
expiry, review cadence, approval, monitoring, and offboarding. High or critical residual risk requires a
documented client-admin acceptance statement before approval.

## Security and time

All rows carry tenant and engagement scope and every mutation writes append-only audit history. Operational
mutations are restricted to client roles so assessors cannot operate controls for the organisation they assess.
Dates are stored in UTC, entered and displayed in each user's saved IANA timezone, and consolidated into the
overdue-work dashboard.
