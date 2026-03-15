#!/bin/bash

while true
do
  # for CICD
  git clone https://github.com/baltej223/server.git temp 
  rm -rf ./src
  mv temp/src src
  rm -rf temp

  cp ./.env ./src/.env
  chmod a+x ./src/run.sh

  cd src
  npm i --force
  npm start
  code=$?

  cd ..
  if [ $code -eq 0 ]; then
      echo "Exited normally. Not restarting."
      break

	elif [ $code -eq 7 ]; then 
		echo "Exit code 7 received. Running redeploy..."
    continue

	else 
		echo "Process crashed with code $code. Restarting..." 
	fi

  sleep 5
done
