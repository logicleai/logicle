#!/bin/bash

# Generate a new base64 secret
NEW_SECRET=$(openssl rand -base64 32)

# Replace the placeholder with the new secret in the .env file
sed -i "s|<YOUR_BASE64_SECRET>|$NEW_SECRET|" .env

echo "Base64 secret has been generated and replaced in .env"