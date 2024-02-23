# Setting Up with SQLite

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

5. **Launch Logicle**

   With the configuration complete, launch the application using the following command:

   ```bash
   docker compose up -d
   ```