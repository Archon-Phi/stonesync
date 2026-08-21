#!/usr/bin/env bash
# Release tag script for StoneSync
set -e

VERSION=${1:-"v1.0.0"}
echo "Tagging release for StoneSync: ${VERSION}"

git tag -a "${VERSION}" -m "StoneSync Release ${VERSION}" || true
echo "Release tag ${VERSION} created."
