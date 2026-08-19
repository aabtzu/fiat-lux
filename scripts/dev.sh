#!/bin/bash
set -a
source /Users/amitbhattacharyya/.config/secrets/common.env
set +a
export LOCAL_DEV=1
cd "$(dirname "$0")/../webapp"
python app.py
