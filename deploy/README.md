# Self-Hosting Guide for Logicle

Logicle can be hosted by yourself on a variety of platforms:
- 🐳 Docker
- 📦 Docker Compose
- ⚓ Kubernetes with Helm Chart (planned for future release)

Logicle has also multi database engine support, currently logicle support:
- SQLite
- PostgreSQL

SQLite is the simplest to begin with as it doesn't require any external dependencies. Deployments using SQLite are ideal for personal, family, or small business use.

Deployments with PostgreSQL need more resources but are better suited for larger enterprise environments, capable of supporting hundreds of users.

## Docker
The easiest method to try out Logicle is by using a Docker container.

### SQLite
By default, the Docker container uses an embedded SQLite database, so no external database is required.

```bash
# Start Logicle with SQLite, without data persistence
docker run -d --name logicle \
-p 3000:3000 \
ghcr.io/logicleai/logicle:latest
```

After starting, the application will be accessible at http://localhost:3000, where you can create your first user.

To maintain the SQLite database data between container restarts, you should bind mount the directory that contains the SQLite database to your machine's filesystem using the command below:

```bash
# Start Logicle with SQLite, with data persistence
docker run -d --name logicle \
-v "$(pwd)"/logicle:/tmp/ \
-p 3000:3000 \
ghcr.io/logicleai/logicle:latest
```

This command ensures that your data persists across container restarts by storing it in a specified directory on your machine.


## Docker Compose Deployment Guide

Docker Compose is the recommended method for deploying Logicle in most business scenarios. This approach ensures data persistence across deployments by utilizing Docker volumes.

### Setting Up with SQLite

To get started with deploying Logicle using SQLite, follow these steps:

1. **Create a Dedicated Directory**

   Begin by creating a dedicated directory for the Logicle deployment:

   ```bash
   mkdir logicle/ && cd logicle/
   ```

2. **Download the Docker Compose File**

   Fetch the `docker-compose.yml` file specific to SQLite deployment:

   ```bash
   wget https://raw.githubusercontent.com/logicleai/logicle/main/deploy/docker-compose/sqlite/docker-compose-sqlite.yml -O docker-compose.yml
   ```

3. **Download the Environment File**

   Download the `.env` file which contains essential settings for starting up the Logicle application:

   ```bash
   wget https://github.com/logicleai/logicle/blob/main/deploy/docker-compose/sqlite/.env.sqlite.example -O .env
   ```

4. **Configure the .env File**

   Before launching the application, you need to edit the `.env` file to set two critical parameters:

   - `APP_PUBLIC_FQDN`: Specify the Fully Qualified Domain Name (FQDN) that external users will use to connect to the application. For instance, if you intend to use `chat.example.com`, enter it here without the protocol prefix (`http://` or `https://`). If you're not using a DNS record, use the IP address of the connecting machine.

   - `NEXTAUTH_SECRET`: This is a secret key used by the authorization library to encrypt JWT sessions. Generate one using the command below:

     ```bash
     openssl rand -base64 32
     ```

