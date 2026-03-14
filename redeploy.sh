#!/bin/bash
set -e

cd "$(dirname "$0")"

rm -rf src

git clone https://github.com/baltej223/server.git src

cp ./.env ./src/.env

bash deploy.sh
