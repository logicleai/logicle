# Docker Compose Deployment Guide for Logicle

Docker Compose is the preferred deployment method for Logicle in most business contexts.

We offer Compose deployments compatible with both SQLite and Postgres databases.

## Key Features:
- **Data Persistency:** All our Compose deployments utilize Docker volumes to ensure data persistency across restarts.
- **HTTPS Support with Let's Encrypt**: For both database options, we provide simple SSL support using Caddy as a reverse proxy and Let's Encrypt for SSL certificates.


## Available Deployments:

Below is a table listing all available deployments using Docker Compose, detailing the database type, whether the deployment supports HTTP or HTTPS with a reverse proxy and Let's Encrypt, and links to the official documentation for each specific deployment.

| Database Type | Deployment Type                         | Official Documentation Link                    |
|---------------|-----------------------------------------|------------------------------------------------|
| SQLite        | HTTP                                    | [SQLite HTTP Deployment](./sqlite/README.md)                    |
| SQLite        | HTTPS with Reverse Proxy & Let's Encrypt| [SQLite HTTPS Deployment](./sqlite/letsencrypt-caddy-reverse-proxy/README.md)                   |
| Postgres      | HTTP                                    | [Postgres HTTP Deployment](./postgres/README.md)                  |
| Postgres      | HTTPS with Reverse Proxy & Let's Encrypt| [Postgres HTTPS Deployment](./postgres/letsencrypt-caddy-reverse-proxy/README.md)                 |