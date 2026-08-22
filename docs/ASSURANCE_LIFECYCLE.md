# Risk, authorisation, and continuous monitoring

OakAttest carries an assessment beyond control testing through a six-stage lifecycle:

1. define and lock the system boundary;
2. assess the in-scope controls;
3. identify and treat system risks;
4. record the accountable system authorisation decision;
5. operate a continuous monitoring plan; and
6. reassess after material change, incident, threat, or control failure.

## Accountability boundaries

Assessors and client users can record system risks. Treatment decisions belong to client users.
Only a `client_admin` can accept residual risk or record a system authorisation decision. Assessor,
assessor-administrator, tenant-owner, and observer roles cannot perform either action. This keeps
assessment conclusions separate from the organisation's business-risk and authorisation decisions.

Risk treatment decisions and authorisation records are append-only versions. A high or extreme
residual risk blocks an `authorised` or `authorised_with_conditions` decision until a current
treatment decision exists. Risk acceptance requires a named accountable person, role, rationale,
decision timestamp, and expiry/review date.

## Monitoring and reassessment

The monitoring plan records its owner, review cadence, monitored signals, change triggers, and next
review in the user's saved IANA timezone. Datetimes are persisted as UTC and rendered back in that
timezone. Control failures always require reassessment. Medium-or-higher incidents and high-or-
critical threats or system changes also open a reassessment trigger.

Every mutation writes to the append-only audit log. All lifecycle tables carry `tenant_id`, are
queried with engagement and tenant filters, and receive the standard post-deploy row-level security
policy and application-role grants.
