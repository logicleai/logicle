# Logicle Deployment Guide with SQLite

Welcome to the deployment guide for setting up Logicle with SQLite. This guide will provide detailed instructions on how to deploy Logicle using docker compose, ensuring a smooth and efficient setup process.

## Prerequisites

Before proceeding with the deployment, ensure the following requirements are met:

- [Docker](https://www.docker.com/get-started/) is installed.
- [Docker Compose](https://docs.docker.com/compose/install/) is installed.
- **RAM:** At least 500 MB of free RAM is available.
- **Storage:** A minimum of 300 MB of free disk space.
- **Ports:** Port 80 is available for use.

## Getting Started

Deploying Logicle is straightforward and can be accomplished in just five steps.

### Step 1: Create a Dedicated Directory

First, create a dedicated directory for your Logicle deployment:

```bash
mkdir logicle/ && cd logicle/
```

### Step 2: Download the Docker Compose File

Next, download the `docker-compose.yml` file tailored for SQLite deployment:

```bash
curl -L https://raw.githubusercontent.com/logicleai/logicle/main/deploy/docker-compose/sqlite/docker-compose-sqlite.yml -o docker-compose.yml
```

### Step 3: Download the Environment File

Proceed by downloading the `.env` file, which contains essential configurations for starting the Logicle application:

```bash
curl -L https://github.com/logicleai/logicle/blob/main/deploy/docker-compose/sqlite/.env.sqlite.example -o .env
```

### Step 4: Configure the .env File

Before launching Logicle, it's crucial to configure the `.env` file with two important parameters:

- `APP_PUBLIC_FQDN`: Define the Fully Qualified Domain Name (FQDN) for external users to connect to the application. Input the domain name here without the protocol prefix (`http://` or `https://`). If not using a DNS record, utilize the IP address of the connecting machine.

- `NEXTAUTH_SECRET`: This secret key is utilized by the authorization library to encrypt JWT sessions. Generate a secret key with the following command:

  ```bash
  openssl rand -base64 32
  ```

### Step 5: Launch Logicle

With all configurations set, launch the application using the command below:

```bash
docker compose up -d
```

Congratulations! You have successfully deployed your new Logicle instance. To access the application, navigate to http://<APP_PUBLIC_FQDN>, where APP_PUBLIC_FQDN is the IP or domain you configured in the previous step.

## Environment Variables

The `.env` file, referenced in steps 3 and 4, is crucial for injecting necessary environment variables into the Docker Compose deployment process. It comes with sensible defaults suitable for most deployments. However, customization is possible to tailor the deployment to specific needs.

*If you want more details about each application variables you can check the comprehensive list of standard application variables is available in the [Environment Variables Documentation](../../environment-variables.md)*

