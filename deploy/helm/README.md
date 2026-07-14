# JustSpace Helm chart

This chart deploys the JustSpace frontend, backend, migration Job, upload storage, and optionally PostgreSQL. The production default is an external TLS-protected PostgreSQL database. Credentials are always referenced from existing Kubernetes Secrets, never rendered from Helm values.

## Installation

Copy [`justspace/values-production.example.yaml`](justspace/values-production.example.yaml) to a private values file, replace every placeholder, and create the referenced Secrets before installing.

```sh
helm dependency build deploy/helm/justspace
helm upgrade --install justspace deploy/helm/justspace \
  --namespace justspace --create-namespace \
  --values values-production.yaml \
  --atomic --wait
```

Release charts are available from GHCR. Use the release version without its leading `v`:

```sh
helm upgrade --install justspace oci://ghcr.io/justlabv1/charts/justspace \
  --version 1.0.0 \
  --namespace justspace --create-namespace \
  --values values-production.yaml \
  --atomic --wait
```

`--atomic --wait` rolls back when the migration Job or a workload does not become ready.

## Required values

The default `values.yaml` is intentionally not installable. Define the following values:

| Value | Configuration |
| --- | --- |
| `global.publicUrl` | Public HTTPS URL, for example `https://justspace.example.com`. It controls backend CORS plus the default frontend API and WebSocket URLs. |
| `frontend.image`, `backend.image` | Repository plus tag or, preferably, immutable `digest`. |
| `backend.existingSecret.name` | Existing Secret with `jwt-secret` and `oidc-encryption-key` by default. The key names are configurable. |
| `backend.externalDatabase` | Host, port, database, user, password Secret reference, and PostgreSQL `sslMode`. The default `verify-full` is recommended; `disable` and the other libpq modes are supported. |
| `ingress` | Enable it, set `host`, an optional `className`, and an existing TLS Secret. |

Create secrets outside Helm, for example:

```sh
kubectl -n justspace create secret generic justspace-application \
  --from-literal=jwt-secret='replace-with-a-random-value-of-at-least-32-characters' \
  --from-literal=oidc-encryption-key='replace-with-a-separate-random-value'

kubectl -n justspace create secret generic justspace-database \
  --from-literal=password='replace-with-the-database-password'
```

## Public access and ingress

Ingress routes `/` to the frontend and `/api` to the backend, including WebSocket upgrades. The standard same-origin configuration derives the API URL from `global.publicUrl` and the WebSocket URL from it using `wss://`.

Set `frontend.apiUrl` and `frontend.wsUrl` only if browsers use different public API endpoints. In that case, `global.publicUrl` must remain the frontend origin accepted by CORS.

```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    nginx.ingress.kubernetes.io/proxy-body-size: 50m
  host: justspace.example.com
  tls:
    enabled: true
    existingSecret: justspace-ingress-tls
```

## PostgreSQL and custom CAs

### External PostgreSQL

External PostgreSQL is recommended. `verify-full` validates both the certificate chain and database hostname; use it whenever TLS is available. The chart does not enforce it, so isolated deployments may set `sslMode: disable`. For private PKI, set exactly one custom CA source; the selected key contains a PEM bundle.

```yaml
customCA:
  enabled: true
  existingConfigMap: organisation-ca
  key: ca.crt
```

The CA bundle is used for PostgreSQL, OIDC discovery/token requests, and Node.js HTTPS in the frontend.

### Optional in-cluster PostgreSQL

Only enable `postgresql.enabled` if you operate its persistent storage, backups, and TLS certificates. Its password Secret needs `postgres-password` and `password`; its TLS Secret needs `tls.crt`, `tls.key`, and `ca.crt`. Enable `customCA` with that CA as well so the backend can verify the database server.

```yaml
postgresql:
  enabled: true
  auth:
    existingSecret: justspace-postgres-auth
  tls:
    enabled: true
    certificatesSecret: justspace-postgres-tls
```

## Storage, resources, and security contexts

Uploaded files use `backend.persistence`. The default creates a 10 GiB `ReadWriteOnce` PVC. Set `existingClaim` for externally managed storage, or set `storageClass`, `accessModes`, and `size` for a chart-managed claim.

`frontend.resources` and `backend.resources` control requests and limits. Treat the defaults as starting points and size them using observed workload metrics.

Pod and container security contexts are configurable independently for frontend and backend. The migration Job reuses the backend settings. This example works with OpenShift SCC-assigned UIDs:

```yaml
backend:
  podSecurityContext:
    runAsNonRoot: true
    runAsUser: null
    runAsGroup: null
    fsGroup: null
    seccompProfile: null
  containerSecurityContext:
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop: [ALL]
```

The frontend and backend images use group-0 permissions, so OpenShift can assign runtime UIDs. Keep the restrictive container settings unless a platform requirement requires an override.

## Network policies

`networkPolicy.enabled` defaults to `false` because ingress-controller labels, DNS, external database networks, and OIDC targets are cluster-specific. When enabled, `networkPolicy.frontend` and `networkPolicy.backend` are rendered exactly as supplied; empty ingress or egress lists deny all traffic for that workload.

At minimum define rules for ingress-controller traffic to the frontend, frontend-to-backend TCP 8080, DNS, backend-to-PostgreSQL TCP 5432, and backend egress to OIDC. Use your cluster's ingress namespace labels and actual database/OIDC CIDRs rather than broad `0.0.0.0/0` rules.

## Migrations, health checks, and upgrades

The `pre-install` and `pre-upgrade` migration Job runs migrations before the workloads start. Backend Pods use `MIGRATIONS_MODE=skip` so they cannot run migrations concurrently. Liveness checks use `/healthz`; readiness checks use `/readyz` and therefore include database availability.

Validate before deploying:

```sh
helm lint deploy/helm/justspace --values values-production.yaml
helm template justspace deploy/helm/justspace \
  --namespace justspace --values values-production.yaml >/tmp/justspace.yaml
```

For upgrades, retain the same PVC and Secrets, verify a database backup, then run the same `helm upgrade --install ... --atomic --wait` command.
