#!/bin/bash
set -e

if [ "$ENV" = 'DEV' ]; then
	NODE_ENV='development' nodemon --inspect app.js
else
	NODE_ENV='production' nodemon cluster.js
fi