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
