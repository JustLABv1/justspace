# JustSpace deployment

## Kubernetes (production)

See [the Helm chart documentation](helm/README.md) for installation, Secrets,
values, TLS/custom CAs, ingress, OpenShift, storage, and network policies.

The Helm chart expects an existing PostgreSQL database and Kubernetes Secrets.
`verify-full` TLS is the secure default, but the database SSL mode is configurable.
It never puts credentials into Helm release metadata. Create one Secret
for `jwt-secret` and `oidc-encryption-key`, and one containing the database
`password`, then copy `helm/justspace/values-production.example.yaml` and replace
the example host, secret names, public URL, and immutable image references.

```sh
helm dependency build deploy/helm/justspace
helm upgrade --install justspace deploy/helm/justspace \
  --namespace justspace --create-namespace \
  --values deploy/helm/justspace/values-production.yaml \
  --atomic --wait
```

Release-Tags publish the same chart as an OCI artifact to GitHub Container
Registry. Replace the version below with the release tag without its leading
`v` and supply your production values file:

```sh
helm upgrade --install justspace oci://ghcr.io/justlabv1/charts/justspace \
  --version 1.0.0 \
  --namespace justspace --create-namespace \
  --values values-production.yaml \
  --atomic --wait
```

The chart routes `/` to the frontend and `/api` (including WebSocket upgrades) to
the backend. Provide an existing TLS secret through `ingress.tls.existingSecret`.
For private PKI, add a ConfigMap or Secret containing one PEM CA bundle through
`customCA`; it is used for PostgreSQL, OIDC, and Node.js HTTPS requests.

The optional `postgresql` dependency is only appropriate when its TLS certificate
and CA secrets are supplied. Its password secret must contain the configured
`postgres-password` and `password` keys; its TLS secret must contain `tls.crt`,
`tls.key`, and `ca.crt`. Back up its PVC outside Helm before upgrades.

## Docker Compose (development/test)

This Compose setup deliberately starts PostgreSQL without TLS and sets
`APP_ENV=development`; it must not be used as a production database deployment.

```sh
cp deploy/.env.example deploy/.env
# Edit deploy/.env with real local values and image references.
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d
```

For an internal CA, set `CUSTOM_CA_CERT_FILE` to a PEM bundle and add the
override file:

```sh
docker compose --env-file deploy/.env \
  -f deploy/docker-compose.yml -f deploy/docker-compose.custom-ca.yml up -d
```
