#!/bin/bash
# for single deploy

echo "Updating repository.."

git pull origin main

cd src
npm install --force
npm start
echo "Process deploy finished!"
