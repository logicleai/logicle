# logicle

Helm chart for deploying [Logicle](https://github.com/logicleai/logicle) on Kubernetes.

This chart replaces the previously separate `logicle-ce` (helm-charts-ce)
and `logicle-ee` (helm-charts-ee) charts. It is published to the same
release name convention as the former EE chart (`nameOverride: logicle-ee`
by default) so existing `logicle-ee-$TENANT` releases can be upgraded onto
this chart in place.

The chart itself carries no product-specific provisioning content
(backends, users, standard tools). Those are raw YAML blobs passed via
`provisioning.backends` / `provisioning.users` / `provisioning.standardTools`
and owned by the deployer (see `logicle-infra-deploy`).

## Prerequisites

- Kubernetes 1.21+
- Helm 3.8+
- A PostgreSQL database
- An ingress controller (e.g. nginx)

## Installation

```bash
helm install logicle-ee-mytenant oci://ghcr.io/logicleai/logicle \
  --set config.fqdn=chat.example.com \
  --set database.host=postgres.example.com \
  --set database.password=<db-password> \
  --set config.NEXTAUTH_SECRET=<random-secret>
```

Application-level file encryption is configured under `storage.encryption`.
Keep the key stable for the lifetime of a tenant; changing it makes existing
encrypted blobs unreadable.

```yaml
storage:
  type: s3
  encryption:
    enabled: true
    provider: aead
    key: <tenant-specific-secret>
```

The chart passes the encryption switch and provider through the ConfigMap and
stores the key in the generated Secret. Existing plaintext blobs are not
rewritten automatically. Use the explicit `dist-reencrypt/reencrypt-file-blobs.js`
utility after reviewing its dry-run output before enabling encryption for a
tenant with existing files. The utility stops on the first read or verification
error by default. For a tenant with known missing legacy objects, pass
`--continue-on-error` only after recording those objects for manual recovery;
each failed blob remains plaintext and is kept in the rewrite ledger with its
error instead of being marked encrypted.
