# Logicle Deployment Guide with Docker Compose

This document provides a comprehensive guide for deploying Logicle using Docker Compose.

This deployment method packages all necessary components, including the database and storage, required to operate a fully functional Logicle instance.

## Prerequisites

Before initiating the deployment process, ensure the following prerequisites are met:

- **Docker Knowledge:** Familiarity with basic Docker concepts.
- **Docker Installation:** Docker must be installed on your system. Refer to the [Docker Installation Guide](https://docs.docker.com/get-docker/) if needed.
- **Docker Compose:** Must be installed. See the [Docker Compose Installation Guide](https://docs.docker.com/compose/install/) for assistance.
- **RAM:** At least 500 MB of RAM should be available.
- **Storage:** A minimum of 300 MB of free disk space is required.
- **Port Availability:** Port 80 should be open for use.

## Deployment Steps

Follow these five steps to deploy Logicle.

### Step 1: Create a Dedicated Directory

Create a directory specifically for Logicle deployment:

```bash
mkdir logicle/ && cd logicle/
```

### Step 2: Select Your Database

Download the appropriate `docker-compose.yml` file based on your database preference:

| Database | Command                                                                                                                                           |
|----------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| SQLite   | `curl -L https://raw.githubusercontent.com/logicleai/logicle/main/deploy/docker-compose/sqlite/docker-compose-sqlite.yml -o docker-compose.yml` |
| Postgres | `curl -L https://raw.githubusercontent.com/logicleai/logicle/main/deploy/docker-compose/postgres/docker-compose-postgres.yml -o docker-compose.yml` |

### Step 3: Download the Environment File

Download the appropriate `.env` file, which includes necessary configurations for Logicle:

| Database | Command |
|----------|---------|
| SQLite   | `curl -L https://raw.githubusercontent.com/logicleai/logicle/main/deploy/docker-compose/sqlite/.env.sqlite.example -o .env` |
| Postgres | `curl -L https://raw.githubusercontent.com/logicleai/logicle/main/deploy/docker-compose/postgres/.env.postgres.example -o .env` |

### Step 4: Configure the .env File

Adjust the `.env` file with the following parameters:

- `APP_PUBLIC_FQDN`: Specify the Fully Qualified Domain Name (FQDN) for external access, excluding the protocol (`http://` or `https://`). Use the IP address if not employing a DNS record.

- `NEXTAUTH_SECRET`: Generate a secret key for JWT session encryption with:

  ```bash
  openssl rand -base64 32
  ```

### Step 5: Launch Logicle

Execute the following command to start Logicle:

```bash
docker compose up -d
```

You have now successfully deployed Logicle. Access the application via `http://<APP_PUBLIC_FQDN>`, replacing `<APP_PUBLIC_FQDN>` with your configured IP or domain.

## Environment Variables

The `.env` file, detailed in steps 3 and 4, is essential for setting environment variables during the Docker Compose deployment. It includes defaults that fit most use cases, but customization is available for specific requirements.

For an exhaustive list of application variables, consult the [Environment Variables Documentation](../environment-variables.md).