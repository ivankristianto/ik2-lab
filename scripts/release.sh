#!/usr/bin/env bash
# Tag main as the next vX.Y.Z and push it, which builds and deploys the image, then create the GitHub release.
# Usage: scripts/release.sh <patch|minor|major|X.Y.Z> [--dry-run]
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
	echo "release: $*" >&2
	exit 1
}

usage="usage: scripts/release.sh <patch|minor|major|X.Y.Z> [--dry-run]"
bump=""
dry_run=0
for arg in "$@"; do
	case "$arg" in
		--dry-run) dry_run=1 ;;
		-*) fail "$usage" ;;
		*) bump="$arg" ;;
	esac
done
[ -n "$bump" ] || fail "$usage"

semver='^([0-9]+)\.([0-9]+)\.([0-9]+)$'

[ "$(git branch --show-current)" = "main" ] || fail "releases are cut from main. Switch to main first."
[ -z "$(git status --porcelain)" ] || fail "the working tree is not clean. Commit or stash first."
gh auth status >/dev/null 2>&1 || fail "gh is not signed in. Run gh auth login first."
git fetch --quiet --tags origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "local main differs from origin/main. Pull or push first."

# The repo has no version file; the newest v* tag is the current version.
latest="$(git tag --list 'v*' --sort=-v:refname | head -n 1)"
current="${latest#v}"
[ -n "$current" ] || current="0.0.0"
[[ "$current" =~ $semver ]] || fail "the newest tag $latest is not vX.Y.Z."
major="${BASH_REMATCH[1]}" minor="${BASH_REMATCH[2]}" patch="${BASH_REMATCH[3]}"

case "$bump" in
	major) version="$((major + 1)).0.0" ;;
	minor) version="$major.$((minor + 1)).0" ;;
	patch) version="$major.$minor.$((patch + 1))" ;;
	*)
		[[ "$bump" =~ $semver ]] || fail "$usage"
		version="$bump"
		;;
esac
tag="v$version"

newest="$(printf '%s\n%s\n' "$current" "$version" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)"
[ "$version" != "$current" ] && [ "$newest" = "$version" ] || fail "$version is not newer than $current."
! git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null || fail "tag $tag already exists."

head="$(git rev-parse HEAD)"
# The brand check is the only CI gate; refuse to ship a commit that failed it.
brand="$(gh run list --workflow brand.yml --commit "$head" --limit 1 --json status,conclusion \
	--jq '.[0] | if . == null then "none" elif .status != "completed" then "pending" else .conclusion end')"
case "$brand" in
	success) ;;
	none) echo "release: warning: no brand run found for HEAD, releasing anyway." >&2 ;;
	*) fail "the brand workflow for HEAD is \"$brand\". Wait for it to pass, then retry." ;;
esac

if [ "$dry_run" -eq 1 ]; then
	echo "release: dry run, would release ${latest:-nothing} -> $tag from $(git rev-parse --short HEAD)"
	exit 0
fi

git tag -a "$tag" -m "$tag"
git push origin "$tag"
gh release create "$tag" --verify-tag --generate-notes --title "$tag"

echo "release: released $tag."
echo "release: the image builds and Dokploy redeploys from: $(gh repo view --json url --jq .url)/actions/workflows/build.yml"
