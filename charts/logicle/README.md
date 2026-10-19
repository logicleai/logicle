# logicle

Helm chart for deploying [Logicle](https://github.com/logicleai/logicle) on Kubernetes.

This chart replaces the previously separate `logicle-ce` (helm-charts-ce)
and `logicle-ee` (helm-charts-ee) charts. It is published to the same
release name convention as the former EE chart (`nameOverride: logicle-ee`
by default) so existing `logicle-ee-$TENANT` releases can be upgraded onto
this chart in place.

The chart itself carries no product-specific provisioning content. The
preferred interface is `provisioning.files`, a map whose keys are filenames
mounted under `/provisioning` (for example, `30-assistants.yaml`). This keeps
each provisioning document separate and lets Logicle process them in filename
order. The legacy `provisioning.backends`, `provisioning.users`, and
`provisioning.standardTools` fields remain supported for older deployers (see
`logicle-infra-deploy`).

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

## File encryption

Application-level file encryption is configured under `storage.encryption`:

```yaml
storage:
  encryption:
    enabled: true
    provider: aead
    key: <tenant-specific-secret>
```

The chart passes the switch and provider through the ConfigMap and stores the
key in the Secret. A nonempty key is required when encryption is enabled.
Preserve the existing tenant key when upgrading: changing or removing it makes
existing encrypted blobs unreadable. Enabling encryption does not automatically
rewrite existing plaintext blobs.

### Encrypt existing plaintext files

The image includes an operator-invoked utility, ported from the `0.35.x` line:

```sh
node dist-reencrypt/reencrypt-file-blobs.js
node dist-reencrypt/reencrypt-file-blobs.js --apply --limit 100
node dist-reencrypt/reencrypt-file-blobs.js --apply --continue-on-error
```

Run it inside the application container with the tenant's database and storage
configuration. Without `--apply`, it only reports the count and total bytes of
plaintext `FileBlob` rows; it does not change storage or create its ledger.
Apply mode currently requires PostgreSQL, `FILE_STORAGE_ENCRYPTION_PROVIDER=aead`,
and a nonempty `FILE_STORAGE_ENCRYPTION_KEY`. Preserve the tenant's existing key.
Take a database and object-store backup and pause application writes for the run.
The utility holds each file's plaintext and verification buffers in memory.

Each rewrite writes to a new object, reads it back without the storage cache,
and verifies its size and SHA-256 before updating `FileBlob` and associated
`File` paths in a transaction. It deletes the old object only after the switch
and only when no `FileBlob` still references it. An operator-created
`FileBlobEncryptionRewrite` ledger lets subsequent runs resume interrupted work
and retry pending cleanup; the command never runs at application startup.

`--limit` caps newly selected blobs after pending ledger work has been resumed.
`--continue-on-error` logs individual failures and continues with other blobs;
review those errors and rerun until the dry run reports no plaintext backlog.
